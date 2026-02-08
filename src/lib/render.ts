import type { Snapshot } from "./schema.js";

export type SnapshotGroups = Readonly<Record<string, readonly Snapshot[]>>;

export type Anomaly = {
  readonly id: string;
  readonly variable: string;
  readonly message: string;
};

const stableStringify = (value: unknown): string => {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const formatCell = (value: unknown): string => {
  const rendered = stableStringify(value);
  if (rendered.length <= 40) {
    return rendered;
  }
  return `${rendered.slice(0, 37)}...`;
};

const collectVariables = (snapshots: readonly Snapshot[]): readonly string[] => {
  const keys = new Set<string>();
  for (const snapshot of snapshots) {
    for (const key of Object.keys(snapshot.vars)) {
      keys.add(key);
    }
  }
  return [...keys].sort();
};

export const groupSnapshots = (snapshots: readonly Snapshot[]): SnapshotGroups => {
  const grouped: Record<string, Snapshot[]> = {};
  for (const snapshot of snapshots) {
    const current = grouped[snapshot.id] ?? [];
    current.push(snapshot);
    grouped[snapshot.id] = current;
  }

  const normalized: Record<string, readonly Snapshot[]> = {};
  for (const [id, entries] of Object.entries(grouped)) {
    normalized[id] = [...entries].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }
  return normalized;
};

const hasStableOtherVariables = (
  snapshots: readonly Snapshot[],
  targetVariable: string,
  variables: readonly string[],
): boolean => {
  for (const variable of variables) {
    if (variable === targetVariable) {
      continue;
    }

    const values = snapshots.map((snapshot) => stableStringify(snapshot.vars[variable]));
    if (new Set(values).size > 1) {
      return false;
    }
  }

  return true;
};

export const detectAnomalies = (groups: SnapshotGroups): readonly Anomaly[] => {
  const anomalies: Anomaly[] = [];

  for (const [id, snapshots] of Object.entries(groups)) {
    const variables = collectVariables(snapshots);

    for (const variable of variables) {
      const values = snapshots.map((snapshot) => snapshot.vars[variable]);
      const serialized = values.map((value) => stableStringify(value));
      const uniqueSerialized = new Set(serialized);

      if (values.some((value) => value === null || value === undefined)) {
        anomalies.push({
          id,
          variable,
          message: `Value is null or undefined in at least one hit`,
        });
      }

      const typeSet = new Set(values.map((value) => typeof value));
      if (typeSet.size > 1) {
        anomalies.push({
          id,
          variable,
          message: `Type changed across hits (${[...typeSet].join(" -> ")})`,
        });
      }

      const numericValues = values.filter((value): value is number => typeof value === "number");
      if (numericValues.length >= 2) {
        const minValue = Math.min(...numericValues);
        const maxValue = Math.max(...numericValues);
        if (minValue > 0 && maxValue / minValue >= 2) {
          anomalies.push({
            id,
            variable,
            message: `Value grew significantly (${minValue} -> ${maxValue})`,
          });
        }
      }

      if (uniqueSerialized.size > 1 && hasStableOtherVariables(snapshots, variable, variables)) {
        const first = serialized[0] ?? "unknown";
        const second = serialized.find((value) => value !== first) ?? "unknown";
        anomalies.push({
          id,
          variable,
          message: `Value changed while other variables stayed constant (${first} -> ${second})`,
        });
      }
    }
  }

  return anomalies;
};

export const renderMarkdown = (
  groups: SnapshotGroups,
  anomalies: readonly Anomaly[],
): string => {
  const sections: string[] = ["## Logpoint Results", ""];

  const ids = Object.keys(groups).sort();
  for (const id of ids) {
    const snapshots = groups[id] ?? [];
    if (snapshots.length === 0) {
      continue;
    }

    const first = snapshots[0];
    const variables = collectVariables(snapshots);

    sections.push(`### ${id} - ${first?.label ?? "unknown"} (${snapshots.length} hits)`);

    const header = ["Hit", ...variables];
    const separator = header.map(() => "---");
    sections.push(`| ${header.join(" | ")} |`);
    sections.push(`| ${separator.join(" | ")} |`);

    snapshots.forEach((snapshot, index) => {
      const cells = [String(index + 1), ...variables.map((key) => formatCell(snapshot.vars[key]))];
      sections.push(`| ${cells.join(" | ")} |`);
    });

    sections.push("");
  }

  sections.push("## Anomalies");
  if (anomalies.length === 0) {
    sections.push("- None detected");
  } else {
    for (const anomaly of anomalies) {
      sections.push(`- **${anomaly.id}.${anomaly.variable}**: ${anomaly.message}`);
    }
  }

  return sections.join("\n");
};

export const renderJson = (
  groups: SnapshotGroups,
  anomalies: readonly Anomaly[],
): string => JSON.stringify({ groups, anomalies }, null, 2);
