import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";
import api, { SESSION_ENDED_EVENT } from "./api";

const original = api.defaults.adapter;
const calls: string[] = [];

// The server rejecting the refresh (AUTH-3: only this ends a session).
const httpError = (status: number) => new AxiosError(String(status), "ERR_BAD_REQUEST", undefined, null, {
  status, data: { error: { code: status === 401 ? "TOKEN_EXPIRED" : "X" } }, statusText: "", headers: {},
  config: {} as InternalAxiosRequestConfig,
});
const refreshRejected = () => httpError(401);

// Stand-in for the network: 401 on the first hit to a URL unless `ok` says that URL now succeeds.
const stubNetwork = (okAfterRefresh: boolean) => {
  let refreshed = false;
  api.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
    calls.push(config.url ?? "");
    if (config.url === "/offers" && !refreshed) {
      throw new AxiosError("401", "ERR_BAD_REQUEST", config, null, {
        status: 401, data: {}, statusText: "", headers: {}, config,
      });
    }
    if (config.url === "/auth/login") {
      throw new AxiosError("401", "ERR_BAD_REQUEST", config, null, {
        status: 401, data: { error: { code: "INVALID_CREDENTIALS" } }, statusText: "", headers: {}, config,
      });
    }
    return { status: 200, data: { ok: okAfterRefresh }, statusText: "", headers: {}, config };
  };
  vi.spyOn(axios, "post").mockImplementation(async () => {
    refreshed = true;
    return { data: { data: { tokens: { accessToken: "new" } } } };
  });
};

const setLocation = (pathname: string, search = "") => {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { pathname, search, href: pathname + search },
  });
};

beforeEach(() => {
  calls.length = 0;
  localStorage.clear();
  setLocation("/dashboard", "?tab=1");
});
afterEach(() => {
  api.defaults.adapter = original;
  vi.restoreAllMocks();
});

describe("api 401 handling", () => {
  it("passes a wrong-password 401 straight through: no redirect, no refresh, tokens untouched", async () => {
    stubNetwork(true);
    localStorage.setItem("access_token", "stale");
    localStorage.setItem("refresh_token", "r");
    await expect(api.post("/auth/login", {})).rejects.toMatchObject({ response: { status: 401 } });
    expect(window.location.href).toBe("/dashboard?tab=1");
    expect(axios.post).not.toHaveBeenCalled();
    expect(localStorage.getItem("refresh_token")).toBe("r");
  });

  it("refreshes once and retries the original request on an expired token", async () => {
    stubNetwork(true);
    localStorage.setItem("refresh_token", "r");
    const res = await api.get("/offers");
    expect(res.data.ok).toBe(true);
    expect(axios.post).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(["/offers", "/offers"]);
    expect(localStorage.getItem("access_token")).toBe("new");
  });

  it("with no refresh token, redirects to login carrying returnUrl, and releases the refresh lock", async () => {
    stubNetwork(true);
    await expect(api.get("/offers")).rejects.toBeTruthy();
    expect(window.location.href).toBe(`/login?returnUrl=${encodeURIComponent("/dashboard?tab=1")}`);

    // A later 401 must still be able to refresh: the lock was not left held.
    localStorage.setItem("refresh_token", "r");
    setLocation("/dashboard");
    const res = await api.get("/offers");
    expect(res.data.ok).toBe(true);
  });

  it("a failed refresh clears tokens and redirects with returnUrl", async () => {
    stubNetwork(true);
    localStorage.setItem("access_token", "a");
    localStorage.setItem("refresh_token", "r");
    vi.spyOn(axios, "post").mockRejectedValue(refreshRejected());
    await expect(api.get("/offers")).rejects.toMatchObject({ response: { status: 401 } });
    expect(localStorage.getItem("access_token")).toBeNull();
    expect(window.location.href).toContain("/login?returnUrl=");
  });

  // isSessionRejected covers every 4xx but 408/429: a deleted user's refresh answers 404.
  it("a 404 from the refresh ends the session like a 401", async () => {
    stubNetwork(true);
    localStorage.setItem("access_token", "a");
    localStorage.setItem("refresh_token", "r");
    vi.spyOn(axios, "post").mockRejectedValue(httpError(404));
    await expect(api.get("/offers")).rejects.toMatchObject({ response: { status: 404 } });
    expect(localStorage.getItem("access_token")).toBeNull();
    expect(localStorage.getItem("refresh_token")).toBeNull();
    expect(window.location.href).toBe(`/login?returnUrl=${encodeURIComponent("/dashboard?tab=1")}`);
  });

  it("does not redirect when already on /login", async () => {
    stubNetwork(true);
    setLocation("/login");
    await expect(api.get("/offers")).rejects.toBeTruthy();
    expect(window.location.href).toBe("/login");
  });
});

// FLOW-1/AUTH-2: the backend now answers 401 to a stale Bearer on guest-capable routes.
// Stand-in backend: "Bearer new" is a user, any other Bearer is a 401, no Bearer is a guest.
const log: Array<string | null> = [];
const stubBackend = () => {
  api.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
    const auth = (config.headers?.Authorization as string | undefined) ?? null;
    log.push(auth);
    if (auth && auth !== "Bearer new") {
      throw new AxiosError("401", "ERR_BAD_REQUEST", config, null, {
        status: 401, data: { error: { code: "TOKEN_EXPIRED" } }, statusText: "", headers: {}, config,
      });
    }
    return { status: 200, data: { as: auth ? "user" : "guest" }, statusText: "", headers: {}, config };
  };
};

describe("stale token on a guest-capable request", () => {
  beforeEach(() => {
    log.length = 0;
    stubBackend();
  });

  it("refreshes and retries with the new token", async () => {
    setLocation("/upload");
    localStorage.setItem("access_token", "stale");
    localStorage.setItem("refresh_token", "r");
    vi.spyOn(axios, "post").mockResolvedValue({ data: { data: { tokens: { accessToken: "new" } } } });
    const res = await api.post("/offers", {});
    expect(res.data.as).toBe("user");
    expect(log).toEqual(["Bearer stale", "Bearer new"]);
    expect(axios.post).toHaveBeenCalledTimes(1);
  });

  it("a failed refresh on a public page logs out first, then retries as a guest, without a redirect", async () => {
    setLocation("/upload");
    localStorage.setItem("access_token", "stale");
    localStorage.setItem("refresh_token", "r");
    vi.spyOn(axios, "post").mockRejectedValue(refreshRejected());
    const onEnded = () => log.push("event");
    window.addEventListener(SESSION_ENDED_EVENT, onEnded);
    try {
      const res = await api.post("/offers", {});
      expect(res.data.as).toBe("guest");
    } finally {
      window.removeEventListener(SESSION_ENDED_EVENT, onEnded);
    }
    expect(log).toEqual(["Bearer stale", "event", null]);
    expect(localStorage.getItem("access_token")).toBeNull();
    expect(localStorage.getItem("refresh_token")).toBeNull();
    expect(window.location.href).toBe("/upload");
  });

  it("requests queued behind a failed refresh are retried as guests too", async () => {
    setLocation("/upload");
    localStorage.setItem("access_token", "stale");
    localStorage.setItem("refresh_token", "r");
    vi.spyOn(axios, "post").mockRejectedValue(refreshRejected());
    const [a, b] = await Promise.all([api.get("/quota"), api.get("/metadata/roles")]);
    expect(a.data.as).toBe("guest");
    expect(b.data.as).toBe("guest");
    expect(axios.post).toHaveBeenCalledTimes(1);
    expect(log).toEqual(["Bearer stale", "Bearer stale", null, null]);
    expect(window.location.href).toBe("/upload");
  });

  it("a failed refresh on a member page redirects with returnUrl and does not retry as a guest", async () => {
    localStorage.setItem("access_token", "stale");
    localStorage.setItem("refresh_token", "r");
    vi.spyOn(axios, "post").mockRejectedValue(refreshRejected());
    await expect(api.get("/offers")).rejects.toMatchObject({ response: { status: 401 } });
    expect(window.location.href).toBe(`/login?returnUrl=${encodeURIComponent("/dashboard?tab=1")}`);
    expect(localStorage.getItem("access_token")).toBeNull();
    expect(localStorage.getItem("refresh_token")).toBeNull();
    expect(log).toEqual(["Bearer stale"]);
  });

  it("no refresh token on a public page: retried as a guest, no refresh, no redirect", async () => {
    setLocation("/salaries");
    localStorage.setItem("access_token", "stale");
    const post = vi.spyOn(axios, "post");
    const res = await api.get("/salaries");
    expect(res.data.as).toBe("guest");
    expect(log).toEqual(["Bearer stale", null]);
    expect(post).not.toHaveBeenCalled();
    expect(window.location.href).toBe("/salaries");
  });
});

// AUTH-3: a refresh that fails for a reason other than the server rejecting it keeps the session.
describe("transient refresh failure", () => {
  const onEnded = () => log.push("event");
  beforeEach(() => {
    log.length = 0;
    stubBackend();
    localStorage.setItem("access_token", "stale");
    localStorage.setItem("refresh_token", "r");
    window.addEventListener(SESSION_ENDED_EVENT, onEnded);
  });
  afterEach(() => window.removeEventListener(SESSION_ENDED_EVENT, onEnded));

  it.each([
    ["a network error", () => new AxiosError("Network Error", "ERR_NETWORK")],
    ["a 500", () => httpError(500)],
    ["a 429", () => httpError(429)],
    ["a 408", () => httpError(408)],
  ])("%s on /upload: tokens kept, no guest upload, no redirect, the request rejects", async (_name, make) => {
    setLocation("/upload");
    const failure = make();
    vi.spyOn(axios, "post").mockRejectedValue(failure);
    await expect(api.post("/offers", {})).rejects.toBe(failure);
    expect(localStorage.getItem("access_token")).toBe("stale");
    expect(localStorage.getItem("refresh_token")).toBe("r");
    expect(log).toEqual(["Bearer stale"]); // no session-ended event, no guest POST /offers
    expect(window.location.href).toBe("/upload");
  });

  it("a 500 on a member page does not redirect", async () => {
    vi.spyOn(axios, "post").mockRejectedValue(httpError(500));
    await expect(api.get("/offers")).rejects.toMatchObject({ response: { status: 500 } });
    expect(window.location.href).toBe("/dashboard?tab=1");
    expect(localStorage.getItem("refresh_token")).toBe("r");
  });

  it("requests queued behind it reject the same way, none as a guest", async () => {
    setLocation("/upload");
    vi.spyOn(axios, "post").mockRejectedValue(httpError(500));
    const results = await Promise.allSettled([api.get("/quota"), api.get("/metadata/roles")]);
    expect(results.map((r) => r.status)).toEqual(["rejected", "rejected"]);
    expect(axios.post).toHaveBeenCalledTimes(1);
    expect(log).toEqual(["Bearer stale", "Bearer stale"]);
    expect(localStorage.getItem("access_token")).toBe("stale");
    expect(localStorage.getItem("refresh_token")).toBe("r");
  });
});

// AUTH-4: tabs share one refresh token.
describe("another tab refreshed", () => {
  beforeEach(() => {
    log.length = 0;
    stubBackend();
    setLocation("/upload");
    localStorage.setItem("access_token", "stale");
    localStorage.setItem("refresh_token", "r");
  });

  it("our refresh is rejected but the token was rotated meanwhile: retried with the new token, no logout", async () => {
    const onEnded = () => log.push("event");
    window.addEventListener(SESSION_ENDED_EVENT, onEnded);
    vi.spyOn(axios, "post").mockImplementation(async () => {
      // The other tab won the rotation and wrote its pair while ours was in flight.
      localStorage.setItem("access_token", "new");
      localStorage.setItem("refresh_token", "r2");
      throw refreshRejected();
    });
    try {
      const res = await api.post("/offers", {});
      expect(res.data.as).toBe("user");
    } finally {
      window.removeEventListener(SESSION_ENDED_EVENT, onEnded);
    }
    expect(log).toEqual(["Bearer stale", "Bearer new"]);
    expect(localStorage.getItem("access_token")).toBe("new");
    expect(localStorage.getItem("refresh_token")).toBe("r2");
  });

  it("the access token changed while the request was out: retried with it, no refresh", async () => {
    const backend = api.defaults.adapter as (c: InternalAxiosRequestConfig) => Promise<unknown>;
    let first = true;
    api.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
      if (first) {
        first = false;
        localStorage.setItem("access_token", "new"); // the other tab's refresh lands
      }
      return backend(config) as never;
    };
    const post = vi.spyOn(axios, "post");
    const res = await api.post("/offers", {});
    expect(res.data.as).toBe("user");
    expect(log).toEqual(["Bearer stale", "Bearer new"]);
    expect(post).not.toHaveBeenCalled();
  });

  it("no cross-tab lock, our 401 arrives before the winner stores its pair: we wait for it, no logout", async () => {
    expect(navigator.locks).toBeUndefined();
    const onEnded = () => log.push("event");
    window.addEventListener(SESSION_ENDED_EVENT, onEnded);
    vi.spyOn(axios, "post").mockImplementation(async () => {
      // The atomic backend 401s us at once; the winner's 200 and write land a moment later.
      setTimeout(() => {
        localStorage.setItem("access_token", "new");
        localStorage.setItem("refresh_token", "r2");
      }, 100);
      throw refreshRejected();
    });
    try {
      const res = await api.post("/offers", {});
      expect(res.data.as).toBe("user");
    } finally {
      window.removeEventListener(SESSION_ENDED_EVENT, onEnded);
    }
    expect(log).toEqual(["Bearer stale", "Bearer new"]);
    expect(localStorage.getItem("access_token")).toBe("new");
    expect(localStorage.getItem("refresh_token")).toBe("r2");
  });

  it("logged out in another tab while we waited for the lock: the original 401 ends the session", async () => {
    setLocation("/dashboard");
    const request = vi.fn((_name: string, fn: () => Promise<unknown>) => {
      localStorage.clear(); // the other tab, holding the lock, logs out
      return fn();
    });
    Object.defineProperty(navigator, "locks", { configurable: true, value: { request } });
    const post = vi.spyOn(axios, "post");
    try {
      await expect(api.get("/offers")).rejects.toMatchObject({ response: { status: 401 }, config: { url: "/offers" } });
    } finally {
      delete (navigator as { locks?: unknown }).locks;
    }
    expect(post).not.toHaveBeenCalled();
    expect(window.location.href).toBe(`/login?returnUrl=${encodeURIComponent("/dashboard")}`);
    expect(log).toEqual(["Bearer stale"]);
  });

  it("refreshes under the cross-tab lock when navigator.locks exists", async () => {
    const request = vi.fn((_name: string, fn: () => Promise<unknown>) => fn());
    Object.defineProperty(navigator, "locks", { configurable: true, value: { request } });
    try {
      vi.spyOn(axios, "post").mockResolvedValue({ data: { data: { tokens: { accessToken: "new" } } } });
      const res = await api.post("/offers", {});
      expect(res.data.as).toBe("user");
      expect(request).toHaveBeenCalledTimes(1);
      expect(request.mock.calls[0][0]).toBe("offerlens-token-refresh");
    } finally {
      delete (navigator as { locks?: unknown }).locks;
    }
  });
});
