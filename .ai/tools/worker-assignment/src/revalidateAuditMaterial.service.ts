/**
 * @file .ai/tools/worker-assignment/src/revalidateAuditMaterial.service.ts
 * @version 1.0.0
 * @date 2026-11-26
 * @description Проверяет снимки завершённых чтений прежней аренды и сохраняет происхождение каждого принятого отчёта.
 * @see documentation/specifications/internal-mcp.md
 */
import {
  readRepositoryFile,
  type RepositoryReadPolicy,
} from "realize-ai-platform/repository-read-policy";
import type {
  IdeAuditRange,
  PriorAuditMaterial,
} from "realize-ai-platform/ide-assignment-queue";
import { verifyAuditDeliveries } from "./auditRanges.service";
import { hashAuditText } from "./checkpoints/hashAuditText.util";
import type { AuditExpansion } from "./auditExpansion.service";
import type { AuditLookup } from "./auditSearchScope.service";

/** Содержимое сверяется до принятия отчёта целого Assignment, в том числе при нескольких файлах. */
export async function revalidateAuditMaterial(
  policy: RepositoryReadPolicy,
  state: AuditExpansion,
  archive: PriorAuditMaterial,
  signal: AbortSignal,
  record: (s: unknown) => void,
) {
  const deliveries = new Map(
    archive.deliveries.map((d) => [d.assignmentId, d]),
  );
  const byPath = new Map<string, IdeAuditRange[]>();
  const invalid = new Set<string>();
  for (const d of deliveries.values())
    for (const range of d.ranges) {
      const list = byPath.get(range.path) ?? [];
      list.push(range);
      byPath.set(range.path, list);
    }
  for (const [path, parts] of byPath) {
    signal.throwIfAborted();
    if (!state.scope.files.has(path)) {
      invalid.add(path);
      continue;
    }
    const file = await readRepositoryFile(policy, path, { signal }).catch(
      () => undefined,
    );
    if (!file) {
      signal.throwIfAborted();
      invalid.add(path);
      continue;
    }
    const lines = file.text.match(/[^\n]*\n|[^\n]+$/g) ?? [];
    if (
      parts.some((r) => {
        if (
          r.fileSha256 !== file.sha256 ||
          r.totalLines !== lines.length ||
          r.startLine < 1 ||
          r.endLine > lines.length ||
          (lines.length
            ? r.endLine < r.startLine
            : r.startLine !== 1 || r.endLine !== 0)
        )
          return true;
        const content = lines.slice(r.startLine - 1, r.endLine).join("");
        return (
          Buffer.byteLength(content) !== r.byteLength ||
          hashAuditText(content) !== r.rangeSha256
        );
      })
    )
      invalid.add(path);
  }
  const whole = new Map<string, IdeAuditRange[]>(),
    reports: string[] = [],
    changed = new Set<string>();
  const saved = new Set<string>();
  let anchor: IdeAuditRange | undefined;
  for (const row of archive.reports) {
    const d = deliveries.get(row.assignmentId);
    if (!d?.ranges.length || d.ranges.some((r) => invalid.has(r.path))) {
      d?.ranges.forEach((r) => changed.add(r.path));
      continue;
    }
    const query: AuditLookup | undefined = row.request
      ? JSON.parse(row.request)
      : undefined;
    for (const r of d.ranges) {
      state.inheritedPins.set(r.path, r.fileSha256);
      const parts = state.reviewedPassages.get(r.path) ?? [];
      parts.push(r);
      state.reviewedPassages.set(r.path, parts);
      if (row.phase === "source-review") {
        const all = whole.get(r.path) ?? [];
        all.push(r);
        whole.set(r.path, all);
      }
    }
    anchor ??= d.ranges[0];
    saved.add(d.assignmentId);
    const note =
      "Проверенный архив " +
      row.assignmentId +
      " [" +
      d.ranges
        .map((r) => r.path + ":" + r.startLine + "–" + r.endLine)
        .join(", ") +
      "] " +
      row.report;
    reports.push(note);
    if (query) state.keepPassage(query, row.report, d.ranges);
  }
  for (const [path, parts] of whole) {
    const d = parts.map((range, i) => ({
      assignmentId: String(i),
      ranges: [range],
    }));
    if (!verifyAuditDeliveries(d, d).completeFiles) continue;
    state.seen.add(path);
    state.reviewed.set(path, parts[0].totalLines);
  }
  const assessment = JSON.parse(archive.assessment) as {
    report: string;
    missing: string[];
    objectives: {
      clause: string;
      basis: string;
      checked: boolean;
      path?: string;
      line?: number;
    }[];
    consumers: { source: string; line: number; value: string }[];
  };
  for (const o of assessment.objectives)
    state.acceptObjectives([
      {
        ...o,
        path: o.path && state.hasCitation(o.path, o.line ?? 0) ? o.path : "",
        line: o.line ?? 0,
        checked: false,
        probe: "",
      },
    ]);
  const open =
    assessment.objectives
      .filter((x) => !x.checked)
      .map((x) => x.clause + " " + x.basis)
      .join("\n") +
    "\n" +
    assessment.report.split("\n\n")[0] +
    "\n" +
    archive.reports
      .filter((r) => r.request)
      .slice(-8)
      .reverse()
      .map((r) => JSON.parse(r.request!).value)
      .join("\n");
  const consumers: AuditLookup[] = assessment.consumers
    .filter((c) => state.hasCitation(c.source, c.line))
    .map((c) => ({
      kind: "consumer",
      scope: "*",
      source: c.source,
      line: c.line,
      value: c.value,
    }));
  record({
    phase: "revalidated",
    sourceAttempt: archive.attempt,
    assignmentIds: [...saved],
    wholeFiles: [...state.reviewed.keys()],
    invalid: [...invalid],
    revisit: [...changed],
    open,
  });
  const earlier = assessment.objectives.filter(
    (o) => o.checked && o.path && state.hasCitation(o.path, o.line ?? 0),
  );
  return { anchor, reports, open, consumers, changed, earlier };
}
