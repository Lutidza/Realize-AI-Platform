/**
 * @file .ai/tools/agent-search/benchmark/runImportResolution.controller.mjs
 * @version 1.1.0
 * @date 2026-09-29
 * @description Измеряет настоящие CLI/MCP import переходы и developer workflows без model calls и записи telemetry.
 * @see documentation/architecture/repository-search.md
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  importResolutionCorpus,
  importResolutionRefusals,
  importResolutionWorkflows,
} from "./importResolution.corpus.mjs";
import { parseSearchOptions } from "../src/parseSearchOptions.validator.mjs";
import { resolveSearchScope } from "../src/resolveSearchScope.adapter.mjs";
import { runRipgrepSearch } from "../src/runRipgrepSearch.adapter.mjs";
import { searchRepository } from "../../../../services/ai-control-plane/src/searchRepository.service.ts";
import { createRepositoryReadPolicy } from "../../../../services/ai-control-plane/src/repositoryReadPolicy.validator.ts";
import { RepositoryCursorService } from "../../../../services/ai-control-plane/src/RepositoryCursor.service.ts";
import { mcpToolInputs } from "../../../../packages/ai-contracts/src/mcpToolInputs.config.ts";
import { mcpToolDataSchemas } from "../../../../packages/ai-contracts/src/mcpToolOutputs.config.ts";

import { assertBenchmarkReport } from "../acceptance/assertSearchAcceptanceReport.validator.mjs";

const args = process.argv.slice(2);
if (args.length > 1 || args.some((arg) => !/^--runs=[1-5]$/.test(arg)))
  throw new Error("Допустим --runs=1..5; JSON отчёт направляется в stdout.");
const runs = Number(args[0]?.split("=")[1] ?? 1);
const root = fileURLToPath(new URL("../../../../", import.meta.url));
const policy = await createRepositoryReadPolicy(root, true);
const cursors = new RepositoryCursorService();
const rows = [];
const workflows = [];

async function call(
  source,
  path,
  query,
  intent = "imports",
  resolveImports = true,
) {
  const started = performance.now();
  if (source === "cli") {
    const options = parseSearchOptions([
      `--intent=${intent}`,
      "--limit=5",
      "--max-bytes=8192",
      ...(resolveImports
        ? ["--resolve-imports", `--from=${path}`]
        : [`--within=${path}`]),
      query,
    ]);
    const result = await runRipgrepSearch(
      options,
      resolveSearchScope(root, options),
    );
    const links = result.records.map((line) => {
      const target = / => ([^:]+):(\d+):\d+ \[/u.exec(line);
      return target
        ? { path: target[1], line: Number(target[2]) }
        : { reason: /\[unresolved:([^\]]+)\]/u.exec(line)?.[1] };
    });
    return {
      links,
      matches: result.records.length,
      partial: Boolean(result.stopped),
      partialReason: result.stopped ?? null,
      coverage: result.navigation ?? null,
      resolution: result.resolution ?? null,
      failure: result.failure ?? null,
      durationMs: performance.now() - started,
      filesRead: result.metrics.filesRead,
      bytesRead: result.metrics.bytesRead,
      outputBytes: result.metrics.outputBytes,
    };
  }
  const metrics = {
    started,
    firstMatchMs: null,
    candidateFiles: null,
    filesRead: 0,
    bytesRead: 0,
    excludedFiles: 0,
  };
  const result = mcpToolDataSchemas.repo_search.parse(
    await searchRepository(
      {
        policy,
        cursors,
        principal: "imports-benchmark",
        searchMetrics: metrics,
        responseBytes: 8192,
      },
      mcpToolInputs.repo_search.parse({
        path,
        query,
        intent,
        resolveImports,
        caseSensitive: true,
        limit: 5,
      }),
    ),
  );
  return {
    links: result.matches.map(
      (match) =>
        match.resolution?.target ?? { reason: match.resolution?.reason },
    ),
    matches: result.matches.length,
    partial: result.truncated,
    partialReason: result.truncationReason,
    coverage: result.navigation ?? null,
    resolution: result.resolution ?? null,
    failure: null,
    durationMs: performance.now() - started,
    filesRead: metrics.filesRead,
    bytesRead: metrics.bytesRead,
    outputBytes: Buffer.byteLength(JSON.stringify(result)),
  };
}

for (let run = 1; run <= runs; run++) {
  for (const scenario of [
    ...importResolutionCorpus,
    ...importResolutionRefusals,
  ]) {
    let expectedLine;
    if (scenario.expectedPath) {
      const text = await readFile(`${root}${scenario.expectedPath}`, "utf8");
      const anchors = text
        .split("\n")
        .flatMap((line, index) =>
          line.includes(scenario.anchor) ? [index + 1] : [],
        );
      if (anchors.length !== 1)
        throw new Error(`Anchor ${scenario.id}: найдено ${anchors.length}`);
      expectedLine = anchors[0];
    }
    for (const source of ["cli", "mcp"]) {
      const result = await call(source, scenario.from, scenario.query);
      rows.push({
        id: scenario.id,
        run,
        source,
        calls: 1,
        expected: scenario.reason ?? "declaration",
        passed:
          !result.failure &&
          result.links.length === 1 &&
          (scenario.reason
            ? result.links[0].reason === scenario.reason
            : result.links[0].path === scenario.expectedPath &&
              result.links[0].line === expectedLine),
        ...result,
      });
    }
  }
  for (const scenario of importResolutionWorkflows) {
    for (const source of ["cli", "mcp"]) {
      const declaration = await call(source, scenario.from, scenario.query);
      const target = declaration.links[0]?.path;
      if (!target)
        throw new Error(`Workflow ${scenario.id}: нет исходного объявления`);
      const references = await call(
        source,
        scenario.consumers,
        scenario.query,
        "references",
        false,
      );
      const dependencies = await call(source, target, "*", "imports", false);
      const stages = [declaration, references, dependencies];
      workflows.push({
        id: scenario.id,
        run,
        source,
        calls: 3,
        passed: stages.every((stage) => !stage.failure && stage.matches > 0),
        durationMs: stages.reduce((sum, stage) => sum + stage.durationMs, 0),
        bytesRead: stages.reduce((sum, stage) => sum + stage.bytesRead, 0),
        outputBytes: stages.reduce((sum, stage) => sum + stage.outputBytes, 0),
        stages: stages.map(({ links: _links, ...stage }) => stage),
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
      const times = selected.map((row) => row.durationMs).sort((a, b) => a - b);
      return {
        source,
        run,
        phase: run === 1 ? "initial" : "repeat",
        firstCallMs: selected[0].durationMs,
        scenarios: selected.length,
        passed: selected.filter((row) => row.passed).length,
        calls: selected.length,
        medianMs: times[Math.floor(times.length / 2)],
        p95Ms: times[Math.ceil(times.length * 0.95) - 1],
        filesRead: selected.reduce((sum, row) => sum + row.filesRead, 0),
        bytesRead: selected.reduce((sum, row) => sum + row.bytesRead, 0),
        outputBytes: selected.reduce((sum, row) => sum + row.outputBytes, 0),
      };
    }),
);
const report = {
  version: 2,
  observedAt: new Date().toISOString(),
  mode: "bounded-adapters",
  runs,
  modelCalls: 0,
  modelTokens: null,
  timing:
    "same-process adapters; initial pass then repeats; excludes CLI process startup and does not reset OS cache",
  summary,
  rows,
  workflows,
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
assertBenchmarkReport(report, "imports", runs);
