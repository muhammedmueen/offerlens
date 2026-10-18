import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";
import api from "./api";

const original = api.defaults.adapter;
const calls: string[] = [];

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
    vi.spyOn(axios, "post").mockRejectedValue(new Error("expired"));
    await expect(api.get("/offers")).rejects.toThrow("expired");
    expect(localStorage.getItem("access_token")).toBeNull();
    expect(window.location.href).toContain("/login?returnUrl=");
  });

  it("does not redirect when already on /login", async () => {
    stubNetwork(true);
    setLocation("/login");
    await expect(api.get("/offers")).rejects.toBeTruthy();
    expect(window.location.href).toBe("/login");
  });
});
