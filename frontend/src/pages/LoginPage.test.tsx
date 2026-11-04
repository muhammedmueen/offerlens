import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { RATE_LIMITED_AUTH_TEXT } from "@/lib/quota";

const login = vi.fn();
vi.mock("@/store/auth", () => ({ useAuth: () => ({ login, loginWithGoogle: vi.fn() }) }));
vi.mock("@react-oauth/google", () => ({ useGoogleLogin: () => vi.fn() }));
vi.mock("@/components/layout/PageShell", () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
const { default: LoginPage } = await import("./LoginPage");

const err = (status: number, code: string) => ({ response: { status, data: { error: { code } } } });
const submit = async (rejection: unknown) => {
  login.mockRejectedValue(rejection);
  render(<MemoryRouter><LoginPage /></MemoryRouter>);
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "a@example.com" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "pw" } });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Log in" })); });
};
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe("LoginPage Google button", () => {
  it("is hidden when VITE_GOOGLE_CLIENT_ID is blank, as .env.example says", () => {
    vi.stubEnv("VITE_GOOGLE_CLIENT_ID", "");
    render(<MemoryRouter><LoginPage /></MemoryRouter>);
    expect(screen.queryByRole("button", { name: "Login with Google" })).toBeNull();
  });

  it("shows when a client id is set", () => {
    vi.stubEnv("VITE_GOOGLE_CLIENT_ID", "client-id.apps.googleusercontent.com");
    render(<MemoryRouter><LoginPage /></MemoryRouter>);
    expect(screen.getByRole("button", { name: "Login with Google" })).toBeTruthy();
  });
});

describe("LoginPage errors", () => {
  it("shows the friendly rate-limit text on a 429, from any of the login limits, and not 'Invalid email or password.'", async () => {
    await submit(err(429, "RATE_LIMIT_EXCEEDED"));
    expect(await screen.findByText(RATE_LIMITED_AUTH_TEXT)).toBeTruthy();
    expect(screen.queryByText("Invalid email or password.")).toBeNull();
  });

  it("still says 'Invalid email or password.' on a 401", async () => {
    await submit(err(401, "INVALID_CREDENTIALS"));
    expect(await screen.findByText("Invalid email or password.")).toBeTruthy();
    expect(screen.queryByText(RATE_LIMITED_AUTH_TEXT)).toBeNull();
  });
});
