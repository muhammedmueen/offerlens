import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

let signedIn = false;
vi.mock("@/store/auth", () => ({
  useAuth: () => ({ isAuthenticated: signedIn, user: signedIn ? { email: "a@b.c" } : null, logout: vi.fn() }),
}));
const { default: Navbar } = await import("./Navbar");

afterEach(cleanup);

// Lighthouse `button-name` (Phase A open item 6): icon-only buttons need an accessible name.
describe("Navbar icon buttons (5.4 clean-up a)", () => {
  it.each([false, true])("every button has a non-empty accessible name (signed in: %s)", (s) => {
    signedIn = s;
    render(<MemoryRouter><Navbar /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
    for (const b of screen.getAllByRole("button", { hidden: true })) {
      const name = b.getAttribute("aria-label") ?? b.textContent ?? "";
      expect(name.trim(), b.outerHTML).not.toBe("");
    }
    expect(screen.getByRole("button", { name: "Close menu" })).toHaveAttribute("aria-expanded", "true");
  });
});
