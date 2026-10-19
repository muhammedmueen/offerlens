import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";
import { API_BASE_URL, ENDPOINTS } from "@/constants/api";

interface QueueItem {
  resolve: (token: string) => void;
  reject: (error: unknown) => void;
}

let isRefreshing = false;
let failedQueue: QueueItem[] = [];

const processQueue = (error: unknown, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token!);
    }
  });
  failedQueue = [];
};

// Credential endpoints: a 401 here means "wrong credentials", not "expired session", so it must
// reach the caller untouched. Logout is authenticated by the refresh token in its body, never
// 401s, and must not refresh: rotation would delete the very token it is about to revoke (AUTH-5).
const NO_REFRESH_ENDPOINTS: string[] = [
  ENDPOINTS.AUTH_LOGIN,
  ENDPOINTS.AUTH_SIGNUP,
  ENDPOINTS.AUTH_GOOGLE,
  ENDPOINTS.AUTH_REFRESH,
  ENDPOINTS.AUTH_LOGOUT,
];

export const SESSION_ENDED_EVENT = "auth:session-ended";

// AUTH-3: the server rejected the session. Network errors, 5xx, 408 and 429 say nothing about it.
export const isSessionRejected = (error: unknown) => {
  const status = axios.isAxiosError(error) ? error.response?.status : undefined;
  return status !== undefined && status >= 400 && status < 500 && status !== 408 && status !== 429;
};

// AUTH-4: tabs share one refresh token, so refresh one tab at a time.
// ponytail: navigator.locks is missing in jsdom, on non-secure origins and in pre-2022 browsers; there
// this is the per-tab lock only. Both tabs then send the same refresh token, and the atomic backend 401s
// the loser fast, often before the winner has stored its pair. The re-read after a rejection only waits
// REFRESH_RACE_GRACE_MS for that write: a winner slower than that still loses its session to the loser's
// clear. Upgrade: a BroadcastChannel/storage-event handoff where losers wait for the winner's pair.
const withTabLock = <T>(fn: () => Promise<T>): Promise<T> =>
  navigator.locks ? navigator.locks.request("offerlens-token-refresh", fn) : fn();
const REFRESH_RACE_GRACE_MS = 500;

type RetryableRequest = InternalAxiosRequestConfig & { _retry?: boolean };

const clearSession = () => {
  localStorage.removeItem("access_token");
  localStorage.removeItem("refresh_token");
  // Lets AuthProvider, which this module cannot reach, show "logged out".
  window.dispatchEvent(new Event(SESSION_ENDED_EVENT));
};

// Hard redirect (not the router) because this runs outside React. Keeps the page the user was on
// so login can return them to it, and does nothing when already on /login, where a reload would
// only wipe the form and its error message.
const redirectToLogin = () => {
  clearSession();
  const { pathname, search } = window.location;
  if (pathname === "/login") return;
  window.location.href = `/login?returnUrl=${encodeURIComponent(pathname + search)}`;
};

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { "Content-Type": "application/json" },
  // Required so the signed httpOnly guest identity cookie is sent (ADR-001).
  // The backend must keep an explicit CORS origin — credentialed requests cannot
  // use a wildcard.
  withCredentials: true,
});

// ponytail: mirrors the <ProtectedRoute> paths in App.tsx. A new member-only page must be added here
// too, or a dead session on it degrades to guest instead of going to /login.
const MEMBER_PAGES = ["/dashboard", "/compare"];
const onMemberPage = () => MEMBER_PAGES.includes(window.location.pathname);

// Retry once with no Bearer: a true guest (ADR-001). Only if a Bearer was sent, and never on a member
// page, where the redirect to /login is already under way.
const retryAsGuest = (request: RetryableRequest, error: unknown) => {
  if (onMemberPage() || !request.headers?.Authorization) return Promise.reject(error);
  delete request.headers.Authorization;
  request._retry = true;
  return api(request);
};

// The session is dead: no refresh token, or the refresh was rejected by the server. Member pages go to /login with
// returnUrl (B9). Elsewhere the session is cleared first, so the UI already shows "logged out", and the
// request is retried as a guest: public pages keep working, and an upload made now is a visible guest
// upload, never a silent one under a signed-in UI (FLOW-1/AUTH-2).
const endSession = (request: RetryableRequest, error: unknown) => {
  if (onMemberPage()) {
    redirectToLogin();
    return Promise.reject(error);
  }
  clearSession();
  return retryAsGuest(request, error);
};

// Request interceptor — attach token
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = localStorage.getItem("access_token");
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  
  // If sending FormData, remove Content-Type header to let axios set it automatically
  if (config.data instanceof FormData && config.headers) {
    console.log('[API] Detected FormData, removing Content-Type header');
    delete config.headers['Content-Type'];
  }
  
  return config;
});

// Response interceptor — handle 401 token refresh
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as RetryableRequest;

    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !NO_REFRESH_ENDPOINTS.includes(originalRequest.url ?? "")
    ) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          if (originalRequest.headers) {
            originalRequest.headers.Authorization = `Bearer ${token}`;
          }
          return api(originalRequest);
        }, (queueError) =>
          // Tokens still stored = a transient failure, the session lives (AUTH-3). endSession clears
          // them synchronously before these handlers run, so a dead session still retries as a guest (FLOW-1).
          localStorage.getItem("refresh_token")
            ? Promise.reject(queueError)
            : retryAsGuest(originalRequest, queueError as unknown));
      }

      originalRequest._retry = true;

      // Checked before taking the refresh lock: bailing out after it left isRefreshing stuck true.
      const refreshToken = localStorage.getItem("refresh_token");
      if (!refreshToken) {
        return endSession(originalRequest, error);
      }
      isRefreshing = true;

      try {
        const newToken = await withTabLock(async () => {
          // Another tab refreshed while this request was out, or while we waited for the lock (AUTH-4).
          const sent = String(originalRequest.headers?.Authorization ?? "").replace(/^Bearer /, "");
          const stored = localStorage.getItem("access_token");
          if (sent && stored && stored !== sent) return stored;
          const currentRefresh = localStorage.getItem("refresh_token");
          if (!currentRefresh) throw error; // logged out in another tab while we waited: a 401, a dead session
          let tokens: { accessToken: string; refreshToken?: string };
          try {
            const { data } = await axios.post(
              `${API_BASE_URL}${ENDPOINTS.AUTH_REFRESH}`,
              { refreshToken: currentRefresh },
              // Bounded so a hung refresh cannot hold the cross-tab lock.
              { withCredentials: true, timeout: 10_000 },
            );
            tokens = data.data.tokens;
          } catch (refreshError) {
            // Without the cross-tab lock, the other tab's winning refresh may not have stored yet.
            if (!navigator.locks && isSessionRejected(refreshError)) {
              await new Promise((r) => setTimeout(r, REFRESH_RACE_GRACE_MS));
            }
            // Another tab rotated the token after we read it; its new pair is already stored (AUTH-4).
            const rotated = localStorage.getItem("refresh_token");
            const access = localStorage.getItem("access_token");
            if (rotated && rotated !== currentRefresh && access) return access;
            throw refreshError;
          }
          const stillOurs = localStorage.getItem("refresh_token");
          if (stillOurs !== currentRefresh) {
            // A logout (here or in another tab), or a newer login, landed while ours was in flight.
            // Storing our pair would undo that logout, so drop it and revoke it (no Bearer, best effort).
            if (tokens.refreshToken) {
              axios
                .post(`${API_BASE_URL}${ENDPOINTS.AUTH_LOGOUT}`, { refreshToken: tokens.refreshToken }, { withCredentials: true })
                .catch(() => {});
            }
            const access = localStorage.getItem("access_token");
            if (stillOurs && access) return access; // a newer login: use it, never clear it
            throw error; // logged out: a dead session (endSession below)
          }
          localStorage.setItem("access_token", tokens.accessToken);
          if (tokens.refreshToken) {
            localStorage.setItem("refresh_token", tokens.refreshToken);
          }
          return tokens.accessToken;
        });
        processQueue(null, newToken);
        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
        }
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        // AUTH-3: only a server rejection ends the session. A blip keeps the tokens, does not redirect
        // or retry as a guest, and fails just this request (and the ones queued behind it).
        if (!isSessionRejected(refreshError)) return Promise.reject(refreshError);
        return endSession(originalRequest, refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default api;
