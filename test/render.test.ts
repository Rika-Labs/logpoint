import { describe, expect, test } from "bun:test";
import {
  detectAnomalies,
  groupSnapshots,
  renderJson,
  renderMarkdown,
} from "../src/lib/render.js";
import type { Snapshot } from "../src/lib/schema.js";

describe("render", () => {
  test("groups by id, sorts by timestamp, and detects stable-peer changes", () => {
    const snapshots: readonly Snapshot[] = [
      {
        id: "hp1",
        file: "cart.ts",
        line: 10,
        label: "cart total",
        hypothesis: "tax applied twice",
        timestamp: "2026-02-08T00:00:01.000Z",
        vars: { total: 100, tax: 16, items: 2 },
        hit: 2,
        maxHits: 100,
      },
      {
        id: "hp1",
        file: "cart.ts",
        line: 10,
        label: "cart total",
        hypothesis: "tax applied twice",
        timestamp: "2026-02-08T00:00:00.000Z",
        vars: { total: 100, tax: 8, items: 2 },
        hit: 1,
        maxHits: 100,
      },
    ];

    const grouped = groupSnapshots(snapshots);
    expect(grouped["hp1"]?.[0]?.timestamp).toBe("2026-02-08T00:00:00.000Z");

    const anomalies = detectAnomalies(grouped);
    expect(anomalies.some((item) => item.id === "hp1" && item.variable === "tax")).toBe(true);

    const markdown = renderMarkdown(grouped, anomalies);
    expect(markdown.includes("## Anomalies")).toBe(true);
    expect(markdown.includes("hp1 - cart total")).toBe(true);
  });

  test("detects nulls, type drift, and large numeric growth", () => {
    const snapshots: readonly Snapshot[] = [
      {
        id: "hp2",
        file: "worker.ts",
        line: 12,
        label: "worker",
        hypothesis: "queue growth",
        timestamp: "2026-02-08T00:00:00.000Z",
        vars: { queue: 10, state: "ready", maybe: undefined },
        hit: 1,
      },
      {
        id: "hp2",
        file: "worker.ts",
        line: 12,
        label: "worker",
        hypothesis: "queue growth",
        timestamp: "2026-02-08T00:00:01.000Z",
        vars: { queue: 25, state: 100, maybe: null },
        hit: 2,
      },
    ];

    const anomalies = detectAnomalies(groupSnapshots(snapshots));
    expect(anomalies.some((item) => item.variable === "maybe" && item.message.includes("null or undefined"))).toBe(true);
    expect(anomalies.some((item) => item.variable === "state" && item.message.includes("Type changed"))).toBe(true);
    expect(anomalies.some((item) => item.variable === "queue" && item.message.includes("grew significantly"))).toBe(true);
  });

  test("renders fallback values and none-detected anomaly section", () => {
    const circular: { self?: unknown } = {};
    circular.self = circular;

    const snapshots: readonly Snapshot[] = [
      {
        id: "hp3",
        file: "api.ts",
        line: 5,
        label: "api",
        hypothesis: "payload",
        timestamp: "2026-02-08T00:00:00.000Z",
        vars: {
          long: "x".repeat(80),
          circular,
        },
        hit: 1,
      },
    ];

    const grouped = groupSnapshots(snapshots);
    const markdown = renderMarkdown(grouped, []);

    expect(markdown.includes("...")).toBe(true);
    expect(markdown.includes("[object Object]")).toBe(true);
    expect(markdown.includes("- None detected")).toBe(true);

    const json = renderJson(
      groupSnapshots([
        {
          id: "hp4",
          file: "api.ts",
          line: 8,
          label: "json",
          hypothesis: "serialization",
          timestamp: "2026-02-08T00:00:00.000Z",
          vars: { ok: true },
          hit: 1,
        },
      ]),
      [],
    );
    const parsed = JSON.parse(json) as { groups: unknown; anomalies: unknown[] };
    expect(parsed.anomalies.length).toBe(0);
  });
});
