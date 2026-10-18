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
// reach the caller untouched. Logout is deliberately not listed — it should still refresh and
// retry so the server-side refresh token actually gets revoked.
const NO_REFRESH_ENDPOINTS: string[] = [
  ENDPOINTS.AUTH_LOGIN,
  ENDPOINTS.AUTH_SIGNUP,
  ENDPOINTS.AUTH_GOOGLE,
  ENDPOINTS.AUTH_REFRESH,
];

const clearSession = () => {
  localStorage.removeItem("access_token");
  localStorage.removeItem("refresh_token");
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
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

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
        });
      }

      originalRequest._retry = true;

      // Checked before taking the refresh lock: bailing out after it left isRefreshing stuck true.
      const refreshToken = localStorage.getItem("refresh_token");
      if (!refreshToken) {
        redirectToLogin();
        return Promise.reject(error);
      }
      isRefreshing = true;

      try {
        const { data } = await axios.post(
          `${API_BASE_URL}${ENDPOINTS.AUTH_REFRESH}`,
          { refreshToken },
          { withCredentials: true },
        );
        const newToken = data.data.tokens.accessToken;
        localStorage.setItem("access_token", newToken);
        if (data.data.tokens.refreshToken) {
          localStorage.setItem("refresh_token", data.data.tokens.refreshToken);
        }
        processQueue(null, newToken);
        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
        }
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        redirectToLogin();
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default api;
