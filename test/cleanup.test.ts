import { describe, expect, test } from "bun:test";
import { cleanupContent, countMarkers } from "../src/lib/injection-engine.js";

describe("cleanupContent", () => {
  const sample = [
    "line one",
    "// LOGPOINT_START [hp1] - test",
    "console.log('x')",
    "// LOGPOINT_END [hp1]",
    "line two",
    "\t__lp_bytes \"bytes\" // LOGPOINT_IMPORT",
  ].join("\n");

  test("removes all logpoints and import markers", () => {
    const result = cleanupContent(sample);
    expect(result.removed).toBe(1);
    expect(result.cleaned.includes("LOGPOINT_START")).toBe(false);
    expect(result.cleaned.includes("LOGPOINT_IMPORT")).toBe(false);
    expect(countMarkers(result.cleaned)).toBe(0);
  });

  test("removes only selected ids", () => {
    const content = [
      "// LOGPOINT_START [hp1] - one",
      "x",
      "// LOGPOINT_END [hp1]",
      "// LOGPOINT_START [hp2] - two",
      "y",
      "// LOGPOINT_END [hp2]",
    ].join("\n");

    const result = cleanupContent(content, ["hp1"]);
    expect(result.removed).toBe(1);
    expect(result.cleaned.includes("LOGPOINT_START [hp1]")).toBe(false);
    expect(result.cleaned.includes("LOGPOINT_START [hp2]")).toBe(true);
  });
});
