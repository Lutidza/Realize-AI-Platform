/**
 * @file .ai/tools/agent-search/benchmark/buildSearchQualityRuns.mapper.mjs
 * @version 1.0.0
 * @date 2026-09-30
 * @description Выводит контрольные summaries из настоящих rows с независимыми target checks и версией корпуса.
 */
import { createHash, randomUUID } from "node:crypto";
import { searchQualityRunSchema } from "../../../../packages/ai-contracts/src/searchQuality.schemas.ts";
export function buildSearchQualityRuns(
  report,
  corpus,
  sourceVersion,
  release = "working-tree",
) {
  const corpusVersion = createHash("sha256")
    .update(JSON.stringify(corpus))
    .digest("hex");
  const kind = report.workflows ? "import-resolution" : "repository-navigation";
  return report.summary.map((summary) => {
    const selected = report.rows.filter(
      (row) => row.source === summary.source && row.run === summary.run,
    );
    const workflows = (report.workflows ?? []).filter(
      (row) => row.source === summary.source && row.run === summary.run,
    );
    const all = [...selected, ...workflows];
    const sum = (field) =>
      all.some((row) => row[field] === null || row[field] === undefined)
        ? null
        : all.reduce((total, row) => total + row[field], 0);
    return searchQualityRunSchema.parse({
      schemaVersion: "1.0",
      id: randomUUID(),
      observedAt: report.observedAt,
      corpus: kind,
      corpusVersion,
      sourceVersion,
      release,
      consumer: summary.source,
      mode: kind === "import-resolution" ? "imports" : report.mode,
      cache: summary.run === 1 ? "initial" : "repeat",
      repeat: summary.run - 1,
      targets: all.length,
      correctTargets: all.filter((row) =>
        kind === "import-resolution"
          ? row.passed === true
          : row.fileHit === true && row.anchorHit === true,
      ).length,
      taskDurationMs: sum("durationMs"),
      calls: sum("calls"),
      filesRead: sum("filesRead"),
      bytesRead: sum("bytesRead"),
      outputBytes: sum("outputBytes"),
    });
  });
}
