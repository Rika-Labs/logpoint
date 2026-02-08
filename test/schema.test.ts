import { describe, expect, test } from "bun:test";
import { Effect } from "effect";
import {
  decodeAnalyzeConfigUnknown,
  decodeCleanupConfigUnknown,
  decodeCollectorConfigUnknown,
  decodeInjectConfigUnknown,
  decodeManifestUnknown,
  decodeSnapshotUnknown,
  parseJsonString,
  withAnalyzeDefaults,
  withCleanupDefaults,
  withCollectorDefaults,
  withInjectDefaults,
  withManifestDefaults,
} from "../src/lib/schema.js";

describe("schema", () => {
  test("parses JSON strings", async () => {
    await expect(Effect.runPromise(parseJsonString('{"ok":true}'))).resolves.toEqual({ ok: true });

    const parsed = await Effect.runPromise(parseJsonString("nope").pipe(Effect.either));
    expect(parsed._tag).toBe("Left");
    if (parsed._tag === "Left") {
      expect(parsed.left._tag).toBe("ParseError");
    }
  });

  test("applies manifest defaults and validates shape", async () => {
    const manifest = await Effect.runPromise(
      decodeManifestUnknown({
        logpoints: [
          {
            id: "hp1",
            file: "src/app.ts",
            line: 10,
            label: "line",
            hypothesis: "value mismatch",
            capture: ["total"],
          },
        ],
      }),
    );

    expect(manifest.port).toBe(9111);
    expect(manifest.projectRoot).toBe(".");
    expect(manifest.logpoints[0]?.maxHits).toBe(100);

    const invalid = await Effect.runPromise(
      decodeManifestUnknown({
        logpoints: [
          {
            id: "BAD ID",
            file: "",
            line: 0,
            label: "",
            hypothesis: "",
            capture: [],
          },
        ],
      }).pipe(Effect.either),
    );

    expect(invalid._tag).toBe("Left");
    if (invalid._tag === "Left") {
      expect(invalid.left._tag).toBe("ManifestError");
    }
  });

  test("decodes snapshot and collector configs", async () => {
    const snapshot = await Effect.runPromise(
      decodeSnapshotUnknown({
        id: "hp1",
        file: "src/app.ts",
        line: 42,
        label: "test",
        hypothesis: "h",
        timestamp: "2026-02-08T12:00:00.000Z",
        vars: { total: 123 },
      }),
    );
    expect(snapshot.id).toBe("hp1");

    const badSnapshot = await Effect.runPromise(
      decodeSnapshotUnknown({ id: "hp1" }).pipe(Effect.either),
    );
    expect(badSnapshot._tag).toBe("Left");

    const collector = await Effect.runPromise(decodeCollectorConfigUnknown({ timeout: 10 }));
    expect(collector.port).toBe(9111);
    expect(collector.timeout).toBe(10);
    expect(collector.output).toBe("/tmp/debug-logpoints.jsonl");
    expect(collector.corsOrigin).toBe("*");

    const badCollector = await Effect.runPromise(
      decodeCollectorConfigUnknown({ port: 1 }).pipe(Effect.either),
    );
    expect(badCollector._tag).toBe("Left");
  });

  test("decodes inject cleanup and analyze configs", async () => {
    const inject = await Effect.runPromise(decodeInjectConfigUnknown({ manifest: "m.json" }));
    expect(inject.manifest).toBe("m.json");
    expect(inject.dryRun).toBe(false);

    const cleanup = await Effect.runPromise(decodeCleanupConfigUnknown({}));
    expect(cleanup.dir).toBe(".");
    expect(cleanup.verify).toBe(true);

    const analyze = await Effect.runPromise(decodeAnalyzeConfigUnknown({}));
    expect(analyze.input).toBe("/tmp/debug-logpoints.jsonl");
    expect(analyze.format).toBe("markdown");

    const badInject = await Effect.runPromise(
      decodeInjectConfigUnknown({ manifest: "" }).pipe(Effect.either),
    );
    expect(badInject._tag).toBe("Left");
  });

  test("exposes default helpers", () => {
    const withManifest = withManifestDefaults({
      logpoints: [
        {
          id: "hp2",
          file: "f.ts",
          line: 1,
          label: "l",
          hypothesis: "h",
          capture: ["x"],
        },
      ],
    });
    expect(withManifest.port).toBe(9111);
    expect(withManifest.logpoints[0]?.maxHits).toBe(100);

    expect(withCollectorDefaults({})).toEqual({
      port: 9111,
      output: "/tmp/debug-logpoints.jsonl",
      timeout: 300,
      corsOrigin: "*",
    });

    expect(withInjectDefaults({ manifest: "a.json" })).toEqual({ manifest: "a.json", dryRun: false });
    expect(withCleanupDefaults({})).toEqual({ dir: ".", dryRun: false, verify: true });
    expect(withAnalyzeDefaults({})).toEqual({ input: "/tmp/debug-logpoints.jsonl", format: "markdown" });
  });
});
