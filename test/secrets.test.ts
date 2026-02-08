import { describe, expect, test } from "bun:test";
import { isSecretVariable } from "../src/lib/secrets.js";

describe("secrets", () => {
  test("flags sensitive names", () => {
    expect(isSecretVariable("password")).toBe(true);
    expect(isSecretVariable("api_key")).toBe(true);
    expect(isSecretVariable("bearerToken")).toBe(true);
    expect(isSecretVariable("csrfToken")).toBe(true);
  });

  test("allows normal variable names", () => {
    expect(isSecretVariable("cartTotal")).toBe(false);
    expect(isSecretVariable("itemCount")).toBe(false);
  });
});
