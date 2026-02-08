import { describe, expect, test } from "bun:test";
import { detectLanguage, isLanguage, SupportedLanguages } from "../src/lib/language.js";

describe("detectLanguage", () => {
  test("maps common extensions", () => {
    expect(detectLanguage("src/index.ts")).toBe("typescript");
    expect(detectLanguage("src/index.js")).toBe("javascript");
    expect(detectLanguage("src/main.py")).toBe("python");
    expect(detectLanguage("src/main.go")).toBe("go");
    expect(detectLanguage("src/main.rb")).toBe("ruby");
    expect(detectLanguage("scripts/run.sh")).toBe("shell");
    expect(detectLanguage("src/Main.java")).toBe("java");
    expect(detectLanguage("src/Program.cs")).toBe("csharp");
    expect(detectLanguage("src/index.php")).toBe("php");
    expect(detectLanguage("src/main.rs")).toBe("rust");
    expect(detectLanguage("src/App.kt")).toBe("kotlin");
  });

  test("falls back to javascript", () => {
    expect(detectLanguage("README")).toBe("javascript");
  });

  test("guards supported languages", () => {
    expect(SupportedLanguages.length).toBeGreaterThanOrEqual(11);
    expect(isLanguage("go")).toBe(true);
    expect(isLanguage("swift")).toBe(false);
  });
});
