import { describe, it, expect } from "vitest";
import { ordinal, safeReturnUrl } from "./utils";

describe("safeReturnUrl", () => {
  it.each(["/dashboard", "/forum/abc", "/compare?a=1", "/"])("keeps the same-site path %s", (path) => {
    expect(safeReturnUrl(path)).toBe(path);
  });

  it.each([
    null,
    "",
    "https://evil.example/",
    "//evil.example/",
    "///evil.example/",
    "/\\evil.example/",
    "\\\\evil.example/",
    "javascript:alert(1)",
    "dashboard",
  ])("replaces %s with the fallback", (value) => {
    expect(safeReturnUrl(value)).toBe("/dashboard");
  });
});

describe("ordinal (MONEY-9)", () => {
  it.each([
    [0, "0th"], [1, "1st"], [2, "2nd"], [3, "3rd"], [4, "4th"],
    [11, "11th"], [12, "12th"], [13, "13th"],
    [21, "21st"], [22, "22nd"], [23, "23rd"],
    [101, "101st"], [111, "111th"],
  ])("%i -> %s", (n, expected) => {
    expect(ordinal(n)).toBe(expected);
  });
});
