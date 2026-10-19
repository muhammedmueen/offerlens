import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";
import api from "@/services/api";
import { AuthProvider, useAuth } from "./auth";

// FLOW-1/AUTH-2: a stale token in storage must not block logging in, and a session that the
// api interceptor ends must flip the UI to logged out.

const original = api.defaults.adapter;
const expired = new Set<string>();
const seen: Array<{ url: string; auth: string | null }> = [];

const unauthorized = (config: InternalAxiosRequestConfig) =>
  new AxiosError("401", "ERR_BAD_REQUEST", config, null, {
    status: 401, data: { error: { code: "TOKEN_EXPIRED" } }, statusText: "", headers: {}, config,
  });
const ok = (config: InternalAxiosRequestConfig, data: unknown) =>
  ({ status: 200, data, statusText: "", headers: {}, config });

beforeEach(() => {
  localStorage.clear();
  expired.clear();
  seen.length = 0;
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { pathname: "/", search: "", href: "/" },
  });
  api.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
    const auth = (config.headers?.Authorization as string | undefined) ?? null;
    seen.push({ url: config.url ?? "", auth });
    if (config.url === "/auth/login") {
      return ok(config, { data: { tokens: { accessToken: "fresh", refreshToken: "fresh-r" } } });
    }
    if (auth && (expired.has(auth) || auth === "Bearer stale")) throw unauthorized(config);
    if (config.url === "/users/me") {
      if (!auth) {
        throw new AxiosError("403", "ERR_BAD_REQUEST", config, null, {
          status: 403, data: {}, statusText: "", headers: {}, config,
        });
      }
      return ok(config, { data: { id: "u1", email: "a@b.c" } });
    }
    return ok(config, { as: auth ? "user" : "guest" });
  };
});
afterEach(() => {
  api.defaults.adapter = original;
  vi.restoreAllMocks();
});

let auth: ReturnType<typeof useAuth>;
const Probe = () => {
  auth = useAuth();
  return <p>{auth.isLoading ? "loading" : auth.isAuthenticated ? "signed-in" : "signed-out"}</p>;
};
const mount = () => render(<AuthProvider><Probe /></AuthProvider>);

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

  it("a dead session ended by the interceptor flips the UI to logged out", async () => {
    localStorage.setItem("access_token", "good");
    localStorage.setItem("refresh_token", "r");
    mount();
    await screen.findByText("signed-in");

    expired.add("Bearer good");
    vi.spyOn(axios, "post").mockRejectedValue(new Error("refresh rejected"));
    window.location.pathname = "/upload";

    let as: string | undefined;
    await act(async () => { as = (await api.post<{ as: string }>("/offers", {})).data.as; });
    expect(as).toBe("guest");
    await waitFor(() => expect(screen.getByText("signed-out")).toBeTruthy());
    expect(localStorage.getItem("access_token")).toBeNull();
  });
});
