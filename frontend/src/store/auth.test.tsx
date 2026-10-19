import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";
import api from "@/services/api";
import { AuthProvider, useAuth } from "./auth";

// FLOW-1/AUTH-2: a stale token in storage must not block logging in, and a session that the
// api interceptor ends must flip the UI to logged out.
// AUTH-3/4/5, MIN-1: only a server rejection ends a session; other tabs are followed; logout
// revokes the refresh token; every session end drops the query cache.

const original = api.defaults.adapter;
const expired = new Set<string>();
const seen: Array<{ url: string; method: string; auth: string | null; body: unknown }> = [];
let meStatus: number | null; // when set, /users/me answers this status
let logoutFails: boolean;

const httpError = (status: number, config?: InternalAxiosRequestConfig) =>
  new AxiosError(String(status), "ERR_BAD_REQUEST", config, null, {
    status, data: { error: { code: status === 401 ? "TOKEN_EXPIRED" : "X" } }, statusText: "", headers: {},
    config: config ?? ({} as InternalAxiosRequestConfig),
  });
const ok = (config: InternalAxiosRequestConfig, data: unknown) =>
  ({ status: 200, data, statusText: "", headers: {}, config });

beforeEach(() => {
  localStorage.clear();
  expired.clear();
  seen.length = 0;
  meStatus = null;
  logoutFails = false;
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { pathname: "/", search: "", href: "/" },
  });
  api.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
    const auth = (config.headers?.Authorization as string | undefined) ?? null;
    const body = typeof config.data === "string" ? JSON.parse(config.data) : config.data;
    seen.push({ url: config.url ?? "", method: config.method ?? "", auth, body });
    if (config.url === "/auth/login") {
      return ok(config, { data: { tokens: { accessToken: "fresh", refreshToken: "fresh-r" } } });
    }
    if (config.url === "/auth/logout") {
      if (logoutFails) throw new AxiosError("Network Error", "ERR_NETWORK", config);
      return ok(config, { data: {} });
    }
    if (auth && (expired.has(auth) || auth === "Bearer stale")) throw httpError(401, config);
    if (config.url === "/users/me") {
      if (meStatus) throw httpError(meStatus, config);
      if (!auth) throw httpError(403, config);
      return ok(config, { data: { id: "u1", email: "a@b.c" } });
    }
    return ok(config, { as: auth ? "user" : "guest" });
  };
});
afterEach(() => {
  api.defaults.adapter = original;
  vi.restoreAllMocks();
  vi.useRealTimers();
});

let auth: ReturnType<typeof useAuth>;
const shown: string[] = [];
const Probe = () => {
  auth = useAuth();
  const text = auth.isLoading ? "loading" : auth.isAuthenticated ? "signed-in" : "signed-out";
  shown.push(text);
  return <p>{text}</p>;
};
let qc: QueryClient;
const mount = () => {
  shown.length = 0;
  qc = new QueryClient();
  return render(<QueryClientProvider client={qc}><AuthProvider><Probe /></AuthProvider></QueryClientProvider>);
};
const seedQuery = () => qc.setQueryData(["dashboard-stats"], { n: 1 });
const cacheIsEmpty = () => expect(qc.getQueryCache().getAll()).toHaveLength(0);

const signIn = async () => {
  localStorage.setItem("access_token", "good");
  localStorage.setItem("refresh_token", "r");
  mount();
  await screen.findByText("signed-in");
};

describe("AuthProvider with a stale token", () => {
  it("login with a stale token in storage still succeeds", async () => {
    const refresh = vi.spyOn(axios, "post");
    mount();
    await screen.findByText("signed-out");
    localStorage.setItem("access_token", "stale");
    localStorage.setItem("refresh_token", "old");

    await act(() => auth.login("a@b.c", "pw"));

    expect(seen.find((c) => c.url === "/auth/login")?.auth).toBe("Bearer stale");
    expect(screen.getByText("signed-in")).toBeTruthy();
    expect(localStorage.getItem("access_token")).toBe("fresh");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("a dead session ended by the interceptor flips the UI to logged out and drops the cache", async () => {
    await signIn();
    seedQuery();

    expired.add("Bearer good");
    vi.spyOn(axios, "post").mockRejectedValue(httpError(401));
    window.location.pathname = "/upload";

    let as: string | undefined;
    await act(async () => { as = (await api.post<{ as: string }>("/offers", {})).data.as; });
    expect(as).toBe("guest");
    await waitFor(() => expect(screen.getByText("signed-out")).toBeTruthy());
    expect(localStorage.getItem("access_token")).toBeNull();
    cacheIsEmpty();
  });
});

// AUTH-3: boot with a transient failure keeps the session in "unknown" and retries.
describe("boot with a transient failure", () => {
  it("/users/me 500: stays loading (never signed-out), tokens kept, retried until it succeeds", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    localStorage.setItem("access_token", "good");
    localStorage.setItem("refresh_token", "r");
    meStatus = 500;
    mount();
    await waitFor(() => expect(seen.filter((c) => c.url === "/users/me")).toHaveLength(1));
    await act(async () => {});

    expect(screen.getByText("loading")).toBeTruthy();
    expect(auth.isAuthenticated).toBe(true); // the Bearer is still being sent
    expect(localStorage.getItem("access_token")).toBe("good");
    expect(localStorage.getItem("refresh_token")).toBe("r");

    meStatus = null;
    await act(() => vi.advanceTimersByTimeAsync(5000));
    await screen.findByText("signed-in");
    expect(shown).not.toContain("signed-out");
  });

  it("network error on the refresh: tokens kept, still loading, no guest /users/me", async () => {
    localStorage.setItem("access_token", "stale");
    localStorage.setItem("refresh_token", "r");
    vi.spyOn(axios, "post").mockRejectedValue(new AxiosError("Network Error", "ERR_NETWORK"));
    mount();
    await waitFor(() => expect(axios.post).toHaveBeenCalledTimes(1));
    await act(async () => {});

    expect(screen.getByText("loading")).toBeTruthy();
    expect(localStorage.getItem("access_token")).toBe("stale");
    expect(localStorage.getItem("refresh_token")).toBe("r");
    expect(seen.filter((c) => c.url === "/users/me" && c.auth === null)).toHaveLength(0);
    expect(shown).not.toContain("signed-out");
  });

  it("a rejected refresh at boot still signs out (guest retry answers 403)", async () => {
    window.location.pathname = "/upload";
    localStorage.setItem("access_token", "stale");
    localStorage.setItem("refresh_token", "r");
    vi.spyOn(axios, "post").mockRejectedValue(httpError(401));
    mount();
    await screen.findByText("signed-out");
    expect(localStorage.getItem("access_token")).toBeNull();
    expect(localStorage.getItem("refresh_token")).toBeNull();
  });
});

// AUTH-5 + MIN-1.
describe("logout", () => {
  it("revokes the refresh token, without a Bearer, and clears tokens and the cache", async () => {
    await signIn();
    seedQuery();
    await act(() => auth.logout());

    await waitFor(() => expect(seen.find((c) => c.url === "/auth/logout")).toBeTruthy());
    const call = seen.find((c) => c.url === "/auth/logout")!;
    expect(call.method).toBe("post");
    expect(call.body).toEqual({ refreshToken: "r" });
    expect(call.auth).toBeNull(); // works even when the access token has expired
    expect(screen.getByText("signed-out")).toBeTruthy();
    expect(localStorage.getItem("access_token")).toBeNull();
    expect(localStorage.getItem("refresh_token")).toBeNull();
    cacheIsEmpty();
  });

  it("a failing logout request still logs out locally", async () => {
    await signIn();
    seedQuery();
    logoutFails = true;
    await act(() => auth.logout());

    await waitFor(() => expect(seen.find((c) => c.url === "/auth/logout")).toBeTruthy());
    expect(screen.getByText("signed-out")).toBeTruthy();
    expect(localStorage.getItem("access_token")).toBeNull();
    expect(localStorage.getItem("refresh_token")).toBeNull();
    cacheIsEmpty();
  });

  // Review issue 2: a refresh that lands after the logout must not sign the user back in.
  it("during an in-flight refresh: the new pair is dropped and revoked, the user stays signed out", async () => {
    await signIn();
    window.location.pathname = "/upload";
    expired.add("Bearer good");
    const post = vi.spyOn(axios, "post").mockImplementation(async (url) => {
      if (String(url).endsWith("/auth/refresh")) {
        void auth.logout(); // the user clicks "Log out" while the refresh is out
        return { data: { data: { tokens: { accessToken: "new", refreshToken: "r2" } } } };
      }
      return { data: {} };
    });

    let as: string | undefined;
    await act(async () => { as = (await api.get<{ as: string }>("/offers")).data.as; });

    expect(as).toBe("guest"); // not retried as the signed-in user
    expect(localStorage.getItem("access_token")).toBeNull();
    expect(localStorage.getItem("refresh_token")).toBeNull();
    expect(post).toHaveBeenCalledWith(
      expect.stringMatching(/\/auth\/logout$/), { refreshToken: "r2" }, expect.anything(),
    );
    expect(seen.find((c) => c.url === "/auth/logout")?.body).toEqual({ refreshToken: "r" });
    expect(screen.getByText("signed-out")).toBeTruthy();
    expect(auth.user).toBeNull();
  });

  it("with no stored refresh token sends no request", async () => {
    localStorage.setItem("access_token", "good");
    mount();
    await screen.findByText("signed-in");
    await act(() => auth.logout());
    await act(async () => {});

    expect(seen.find((c) => c.url === "/auth/logout")).toBeUndefined();
    expect(screen.getByText("signed-out")).toBeTruthy();
  });
});

// AUTH-4 / MIN-1: follow the other tabs through the storage event.
describe("another tab", () => {
  const storageEvent = (oldValue: string | null, newValue: string | null) =>
    act(() => { window.dispatchEvent(new StorageEvent("storage", { key: "refresh_token", oldValue, newValue })); });

  it("logged out: this tab signs out and drops the cache", async () => {
    await signIn();
    seedQuery();
    localStorage.clear();
    await storageEvent("r", null);
    expect(screen.getByText("signed-out")).toBeTruthy();
    cacheIsEmpty();
  });

  it("cleared all storage (key: null): this tab signs out and drops the cache", async () => {
    await signIn();
    seedQuery();
    localStorage.clear();
    await act(() => { window.dispatchEvent(new StorageEvent("storage", { key: null })); });
    expect(screen.getByText("signed-out")).toBeTruthy();
    expect(auth.user).toBeNull();
    cacheIsEmpty();
  });

  it("rotated the refresh token: this tab stays signed in", async () => {
    await signIn();
    localStorage.setItem("refresh_token", "r2");
    await storageEvent("r", "r2");
    expect(screen.getByText("signed-in")).toBeTruthy();
  });

  it("logged in: this tab signs in", async () => {
    mount();
    await screen.findByText("signed-out");
    localStorage.setItem("access_token", "good");
    localStorage.setItem("refresh_token", "r");
    await storageEvent(null, "r");
    await screen.findByText("signed-in");
  });
});
