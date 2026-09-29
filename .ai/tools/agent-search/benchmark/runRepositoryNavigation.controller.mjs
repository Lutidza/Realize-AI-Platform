/**
 * @file .ai/tools/agent-search/benchmark/runRepositoryNavigation.controller.mjs
 * @version 1.1.0
 * @date 2026-09-29
 * @description Измеряет реальные CLI/MCP adapters без записи benchmark событий в рабочую диагностику.
 * @see documentation/architecture/repository-search.md
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { repositoryNavigationCorpus } from "./repositoryNavigation.corpus.mjs";
import { parseSearchOptions } from "../src/parseSearchOptions.validator.mjs";
import { resolveSearchScope } from "../src/resolveSearchScope.adapter.mjs";
import { runRipgrepSearch } from "../src/runRipgrepSearch.adapter.mjs";
import { searchRepository } from "../../../../services/ai-control-plane/src/searchRepository.service.ts";
import { createRepositoryReadPolicy } from "../../../../services/ai-control-plane/src/repositoryReadPolicy.validator.ts";
import { RepositoryCursorService } from "../../../../services/ai-control-plane/src/RepositoryCursor.service.ts";
import { mcpToolInputs } from "../../../../packages/ai-contracts/src/mcpToolInputs.config.ts";

import { assertBenchmarkReport } from "../acceptance/assertSearchAcceptanceReport.validator.mjs";

const navigation = process.argv.includes("--navigation");
const runArgs = process.argv
  .slice(2)
  .filter((arg) => /^--runs=[1-5]$/.test(arg));
if (
  runArgs.length > 1 ||
  process.argv
    .slice(2)
    .some((arg) => arg !== "--navigation" && !/^--runs=[1-5]$/.test(arg))
)
  throw new Error(
    "Допустимы --navigation и --runs=1..5; JSON отчёт направляется в stdout.",
  );
const runs = Number(runArgs[0]?.split("=")[1] ?? 1);
const root = fileURLToPath(new URL("../../../../", import.meta.url));
const policy = await createRepositoryReadPolicy(root, true);
const cursors = new RepositoryCursorService();
const rows = [];
for (let run = 1; run <= runs; run++) {
  for (const scenario of repositoryNavigationCorpus) {
    const text = await readFile(`${root}${scenario.expectedPath}`, "utf8");
    const lines = text.split("\n");
    const anchors = lines.flatMap((line, index) =>
      line.includes(scenario.anchor) ? [index + 1] : [],
    );
    if (anchors.length !== 1)
      throw new Error(`Anchor ${scenario.id}: найдено ${anchors.length}`);
    for (const source of ["cli", "mcp"]) {
      const started = performance.now();
      let matches, metrics, partial, partialReason, coverage, failure;
      if (source === "cli") {
        const options = parseSearchOptions([
          `--within=${scenario.scope}`,
          "--limit=5",
          "--max-bytes=8192",
          ...(navigation ? [`--intent=${scenario.intent}`] : []),
          scenario.query,
        ]);
        const result = await runRipgrepSearch(
          options,
          resolveSearchScope(root, options),
        );
        matches = result.records.map((line) => {
          const match = /^(.*):(\d+):(\d+):/u.exec(line);
          return match
            ? { path: match[1], line: Number(match[2]) }
            : { path: line };
        });
        metrics = {
          ...result.metrics,
          filesRead: result.metrics.filesRead ?? null,
          bytesRead: result.metrics.bytesRead ?? null,
        };
        partial = Boolean(result.stopped);
        partialReason = result.stopped ?? null;
        coverage = result.navigation ?? null;
        failure = result.failure ?? null;
      } else {
        metrics = {
          started,
          firstMatchMs: null,
          candidateFiles: null,
          filesRead: 0,
          bytesRead: 0,
          excludedFiles: 0,
        };
        const result = await searchRepository(
          {
            policy,
            cursors,
            principal: "navigation-benchmark",
            searchMetrics: metrics,
            responseBytes: 8192,
          },
          mcpToolInputs.repo_search.parse({
            query: scenario.query,
            path: scenario.scope,
            caseSensitive: true,
            limit: 5,
            ...(navigation ? { intent: scenario.intent } : {}),
          }),
        );
        matches = result.matches;
        metrics = {
          ...metrics,
          outputBytes: Buffer.byteLength(JSON.stringify(result)),
        };
        delete metrics.started;
        partial = result.truncated;
        partialReason = result.truncationReason;
        coverage = result.navigation ?? null;
        failure = null;
      }
      rows.push({
        id: scenario.id,
        run,
        source,
        intent: scenario.intent,
        calls: 1,
        fileHit: matches.some((match) => match.path === scenario.expectedPath),
        anchorHit: matches.some(
          (match) =>
            match.path === scenario.expectedPath && match.line === anchors[0],
        ),
        results: matches.length,
        partial,
        partialReason,
        coverage,
        failure,
        ...metrics,
        durationMs: performance.now() - started,
      });
    }
  }
}
const summary = Array.from({ length: runs }, (_, index) => index + 1).flatMap(
  (run) =>
    ["cli", "mcp"].map((source) => {
      const selected = rows.filter(
        (row) => row.source === source && row.run === run,
      );
      const durations = selected
        .map((row) => row.durationMs)
        .sort((a, b) => a - b);
      return {
        source,
        run,
        phase: run === 1 ? "initial" : "repeat",
        firstCallMs: selected[0].durationMs,
        scenarios: selected.length,
        fileHits: selected.filter((row) => row.fileHit).length,
        anchorHits: selected.filter((row) => row.anchorHit).length,
        calls: selected.reduce((sum, row) => sum + row.calls, 0),
        medianMs: durations[Math.floor(durations.length / 2)],
        p95Ms: durations[Math.ceil(durations.length * 0.95) - 1],
        outputBytes: selected.reduce((sum, row) => sum + row.outputBytes, 0),
        bytesRead: selected.some((row) => row.bytesRead === null)
          ? null
          : selected.reduce((sum, row) => sum + row.bytesRead, 0),
        failures: selected.filter((row) => row.failure).length,
      };
    }),
);
const report = {
  version: 2,
  mode: navigation ? "navigation" : "literal-baseline",
  observedAt: new Date().toISOString(),
  runs,
  limit: 5,
  modelCalls: 0,
  modelTokens: null,
  timing:
    "same-process adapters; initial pass then repeats; excludes CLI process startup and does not reset OS cache",
  summary,
  rows,
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (navigation) assertBenchmarkReport(report, "navigation", runs);
