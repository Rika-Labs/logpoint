import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "bun:test";
import { Effect } from "effect";
import { appendJsonLine, readJsonLines } from "../src/lib/jsonl.js";

describe("jsonl", () => {
  test("appends and reads JSON lines", async () => {
    const dir = await mkdtemp(join(tmpdir(), "logpoint-jsonl-"));
    const file = join(dir, "events.jsonl");

    await Effect.runPromise(appendJsonLine(file, { id: "hp1", hit: 1 }));
    await Effect.runPromise(appendJsonLine(file, { id: "hp1", hit: 2 }));

    const lines = await Effect.runPromise(readJsonLines(file));
    expect(lines).toEqual([
      { id: "hp1", hit: 1 },
      { id: "hp1", hit: 2 },
    ]);
  });

  test("fails with ParseError when payload is not serializable", async () => {
    const dir = await mkdtemp(join(tmpdir(), "logpoint-jsonl-"));
    const file = join(dir, "events.jsonl");

    const circular: Record<string, unknown> = {};
    circular["self"] = circular;

    const result = await Effect.runPromise(appendJsonLine(file, circular).pipe(Effect.either));
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left._tag).toBe("ParseError");
    }
  });

  test("fails on malformed input and missing files", async () => {
    const dir = await mkdtemp(join(tmpdir(), "logpoint-jsonl-"));
    const malformed = join(dir, "bad.jsonl");
    await writeFile(malformed, '{"ok":true}\nnot-json\n', "utf8");

    const malformedResult = await Effect.runPromise(readJsonLines(malformed).pipe(Effect.either));
    expect(malformedResult._tag).toBe("Left");
    if (malformedResult._tag === "Left") {
      expect(malformedResult.left._tag).toBe("ParseError");
    }

    const missingResult = await Effect.runPromise(readJsonLines(join(dir, "missing.jsonl")).pipe(Effect.either));
    expect(missingResult._tag).toBe("Left");
    if (missingResult._tag === "Left") {
      expect(missingResult.left._tag).toBe("FileReadError");
    }
  });
});
