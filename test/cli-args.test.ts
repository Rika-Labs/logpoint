import { describe, expect, test } from "bun:test";
import { Effect } from "effect";
import {
  optionalBooleanOption,
  optionalCsvOption,
  optionalNumberOption,
  optionalStringOption,
  parseArgs,
  requireStringOption,
} from "../src/lib/cli-args.js";

describe("cli args", () => {
  test("parses positionals and flags", () => {
    const parsed = parseArgs([
      "inject",
      "manifest.json",
      "--port",
      "9111",
      "--timeout=300",
      "--dry-run",
      "-abc",
      "--",
      "ignored",
    ]);

    expect(parsed.positionals).toEqual(["inject", "manifest.json", "ignored"]);
    expect(parsed.options["port"]).toBe("9111");
    expect(parsed.options["timeout"]).toBe("300");
    expect(parsed.options["dry-run"]).toBe(true);
    expect(parsed.options["a"]).toBe(true);
    expect(parsed.options["b"]).toBe(true);
    expect(parsed.options["c"]).toBe(true);
  });

  test("supports optional and required option readers", async () => {
    const parsed = parseArgs(["--manifest", "m.json", "--verify=false", "--ids", "hp1,hp2", "--port", "9000"]);

    await expect(Effect.runPromise(requireStringOption(parsed, "manifest"))).resolves.toBe("m.json");
    await expect(Effect.runPromise(optionalStringOption(parsed, "manifest"))).resolves.toBe("m.json");
    await expect(Effect.runPromise(optionalStringOption(parsed, "missing"))).resolves.toBeUndefined();
    await expect(Effect.runPromise(optionalBooleanOption(parsed, "verify"))).resolves.toBe(false);
    await expect(Effect.runPromise(optionalBooleanOption(parsed, "dry-run"))).resolves.toBeUndefined();
    await expect(Effect.runPromise(optionalNumberOption(parsed, "port"))).resolves.toBe(9000);
    await expect(Effect.runPromise(optionalCsvOption(parsed, "ids"))).resolves.toEqual(["hp1", "hp2"]);
  });

  test("returns ValidationError for missing required and invalid number", async () => {
    const missingRequired = parseArgs([]);
    const missingResult = await Effect.runPromise(requireStringOption(missingRequired, "manifest").pipe(Effect.either));
    expect(missingResult._tag).toBe("Left");
    if (missingResult._tag === "Left") {
      expect(missingResult.left._tag).toBe("ValidationError");
      expect(missingResult.left.message).toBe("Missing required option --manifest");
    }

    const invalidNumber = parseArgs(["--timeout", "NaN"]);
    const invalidResult = await Effect.runPromise(optionalNumberOption(invalidNumber, "timeout").pipe(Effect.either));
    expect(invalidResult._tag).toBe("Left");
    if (invalidResult._tag === "Left") {
      expect(invalidResult.left._tag).toBe("ValidationError");
      expect(invalidResult.left.message).toBe("Option --timeout is not a valid number");
    }

    const booleanNumber = parseArgs(["--timeout"]);
    const booleanResult = await Effect.runPromise(optionalNumberOption(booleanNumber, "timeout").pipe(Effect.either));
    expect(booleanResult._tag).toBe("Left");
    if (booleanResult._tag === "Left") {
      expect(booleanResult.left.message).toBe("Option --timeout requires a number");
    }
  });

  test("filters empty csv entries and empty long flags", async () => {
    const parsed = parseArgs(["--", "--ids", " hp1, , hp2 ,,", "--", "foo", "--=bad"]);

    await expect(Effect.runPromise(optionalCsvOption(parsed, "ids"))).resolves.toEqual(["hp1", "hp2"]);

    const weird = parseArgs(["--", "-", "--", "value"]);
    expect(weird.positionals).toEqual(["value"]);
  });
});
