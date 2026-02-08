import { describe, expect, test } from "bun:test";
import { generateTemplate } from "../src/lib/templates.js";

const base = {
  id: "hp1",
  file: "src/file.ts",
  line: 10,
  label: "label",
  hypothesis: "hypothesis",
  capture: ["total", "tax"],
  maxHits: 100,
  port: 9111,
} as const;

describe("generateTemplate", () => {
  test("generates markers for all languages", () => {
    const languages = [
      "javascript",
      "typescript",
      "python",
      "go",
      "ruby",
      "shell",
      "java",
      "csharp",
      "php",
      "rust",
      "kotlin",
    ] as const;

    for (const language of languages) {
      const generated = generateTemplate(base, language);
      expect(generated.lines.length).toBeGreaterThan(0);
      expect(generated.lines[0]?.includes("LOGPOINT_START")).toBe(true);
      expect(generated.lines[generated.lines.length - 1]?.includes("LOGPOINT_END")).toBe(true);
    }
  });
});
