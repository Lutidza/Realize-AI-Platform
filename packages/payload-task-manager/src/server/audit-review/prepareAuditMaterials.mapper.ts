/**
 * @file packages/payload-task-manager/src/server/audit-review/prepareAuditMaterials.mapper.ts
 * @version 1.0.0
 * @date 2026-11-25
 * @description Проверяет манифест передачи и готовит точные байты артефактов и исходников для досье.
 * @see documentation/specifications/task-management/execution/article-audit-publication.md
 */
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type { AuditPublication } from "./AuditPublication.types";

const hash = (bytes: Buffer | string) =>
  createHash("sha256").update(bytes).digest("hex");

/** Восстанавливает объединение интервалов из исходных квитанций, сохраняя пробелы. */
function checkCoverage(
  coverage: AuditPublication["coverage"],
  sources: Map<string, AuditPublication["sources"][number]>,
) {
  const calls = new Set<string>();
  const requests = new Set<string>();
  if (
    coverage.length !== 12 ||
    new Set(coverage.map((file) => file.path)).size !== 12
  )
    throw new Error("audit_coverage_invalid");
  for (const file of coverage) {
    const source = sources.get(file.path);
    if (
      !source ||
      source.sha256 !== file.sha256 ||
      file.status !== (file.receipts.length ? "read" : "unread")
    )
      throw new Error("audit_coverage_invalid");
    const ranges: { startLine: number; endLine: number }[] = [];
    const lines =
      source.bytes.toString("utf8").match(/[^\n]*\n|[^\n]+$/g)?.length ?? 0;
    const ordered = [...file.receipts].sort(
      (a, b) => a.startLine - b.startLine || a.endLine - b.endLine,
    );
    for (const receipt of ordered) {
      const { startLine, endLine, sourceRequestId, requestId, toolCallId } =
        receipt;
      if (
        !toolCallId ||
        calls.has(toolCallId) ||
        !requestId ||
        !sourceRequestId ||
        requestId === sourceRequestId ||
        requests.has(requestId) ||
        typeof receipt.truncated !== "boolean" ||
        !Number.isSafeInteger(startLine) ||
        !Number.isSafeInteger(endLine) ||
        startLine < 1 ||
        endLine > lines ||
        (endLine < startLine &&
          !(lines === 0 && startLine === 1 && endLine === 0))
      )
        throw new Error("audit_coverage_invalid");
      calls.add(toolCallId);
      requests.add(requestId);
      if (endLine < startLine) continue;
      const previous = ranges.at(-1);
      if (previous && startLine <= previous.endLine + 1)
        previous.endLine = Math.max(previous.endLine, endLine);
      else ranges.push({ startLine, endLine });
    }
    if (!isDeepStrictEqual(ranges, file.ranges))
      throw new Error("audit_coverage_invalid");
  }
}

/** Снимает копию входа до первого await. В хеш входят поля и порядок версии манифеста runtime V1. */
export function prepareAuditMaterials(input: AuditPublication) {
  if (
    input.schemaVersion !== 1 ||
    !input.attemptId ||
    !input.report?.trim() ||
    !Number.isSafeInteger(input.checkpointRevision) ||
    input.checkpointRevision < 1 ||
    !Array.isArray(input.sources) ||
    input.sources.length !== 18 ||
    !Array.isArray(input.coverage)
  )
    throw new Error("audit_publication_invalid");
  const sources = new Map<string, AuditPublication["sources"][number]>();
  for (const source of input.sources) {
    if (
      !source.path ||
      sources.has(source.path) ||
      !Buffer.isBuffer(source.bytes)
    )
      throw new Error("audit_source_mismatch");
    const bytes = Buffer.from(source.bytes);
    if (hash(bytes) !== source.sha256) throw new Error("audit_source_mismatch");
    sources.set(source.path, {
      path: source.path,
      sha256: source.sha256,
      bytes,
    });
  }
  const manifest = {
    schemaVersion: input.schemaVersion,
    attemptId: input.attemptId,
    checkpointRevision: input.checkpointRevision,
    task: structuredClone(input.task),
    report: input.report,
    reportSha256: input.reportSha256,
    coverage: structuredClone(input.coverage),
  };
  const report = Buffer.from(manifest.report, "utf8");
  if (
    hash(report) !== manifest.reportSha256 ||
    hash(JSON.stringify(manifest)) !== input.handoffSha256
  )
    throw new Error("audit_publication_invalid");
  checkCoverage(manifest.coverage, sources);
  const coverage = Buffer.from(JSON.stringify(manifest.coverage), "utf8");
  return {
    manifest,
    handoffSha256: input.handoffSha256,
    report,
    coverage,
    coverageSha256: hash(coverage),
    sources,
    sourcePins: Object.fromEntries(
      [...sources.values()].map((s) => [s.path, s.sha256]),
    ),
    scopePins: Object.fromEntries(
      manifest.coverage.map((s) => [s.path, s.sha256]),
    ),
  };
}
