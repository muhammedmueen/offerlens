/**
 * Basic setup test to verify Jest configuration
 */
describe("Jest Setup", () => {
  it("should run tests successfully", () => {
    expect(true).toBe(true);
  });

  it("should have access to environment variables", () => {
    expect(process.env.NEXT_PUBLIC_API_URL).toBeDefined();
    expect(process.env.NEXT_PUBLIC_API_URL).toBe(
      "http://localhost:3001/api/v1"
    );
  });

  it("should support TypeScript", () => {
    const greeting: string = "Hello, TypeScript!";
    expect(greeting).toBe("Hello, TypeScript!");
  });
});
