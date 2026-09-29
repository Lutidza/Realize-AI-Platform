/**
 * @file .ai/tools/agent-search/acceptance/assertSearchAcceptanceReport.validator.mjs
 * @version 1.0.0
 * @date 2026-09-29
 * @description Проверяет фактическое покрытие приёмки; пустые, пропущенные и частично успешные наборы не принимаются.
 * @see documentation/architecture/repository-search.md
 */
import { repositoryNavigationCorpus } from "../benchmark/repositoryNavigation.corpus.mjs";
import {
  importResolutionCorpus,
  importResolutionRefusals,
  importResolutionWorkflows,
} from "../benchmark/importResolution.corpus.mjs";
import { SEARCH_ACCEPTANCE_LIMITS as limits } from "./searchAcceptance.config.mjs";

const require = (condition, message) => {
  if (!condition) throw new Error(`Приёмка: ${message}`);
};
const bounded = (value, maximum = Number.MAX_SAFE_INTEGER) =>
  Number.isFinite(value) && value >= 0 && value <= maximum;

export function assertNodeReport(output, minimum) {
  const counts = {};
  for (const key of ["tests", "pass", "fail", "cancelled", "skipped", "todo"]) {
    const matches = [...output.matchAll(new RegExp(`^# ${key} (\\d+)$`, "gm"))];
    require(matches.length === 1, `нет однозначного TAP счётчика ${key}`);
    counts[key] = Number(matches[0][1]);
  }
  require(counts.tests >= minimum &&
    counts.pass === counts.tests &&
    ["fail", "cancelled", "skipped", "todo"].every(
      (key) => counts[key] === 0,
    ), "CLI suite не завершена полностью");
  return counts;
}

export function assertVitestReport(report, suite) {
  require(report.success === true &&
    report.numTotalTests >= suite.minimum &&
    report.numPassedTests === report.numTotalTests &&
    report.numFailedTests === 0 &&
    report.numPendingTests === 0 &&
    (report.numTodoTests ?? 0) === 0, "обязательные Vitest тесты не выполнены");
  require(report.testResults?.length ===
    suite.files.length, "изменился набор Vitest файлов");
  for (const file of suite.files) {
    const results = report.testResults.filter((result) =>
      result.name.replaceAll("\\", "/").endsWith(`/${file}`),
    );
    require(results.length === 1 &&
      results[0].status === "passed" &&
      results[0].assertionResults.length > 0 &&
      results[0].assertionResults.every(
        (result) => result.status === "passed",
      ), `неполное покрытие ${file}`);
  }
  return {
    tests: report.numTotalTests,
    passed: report.numPassedTests,
    skipped: 0,
  };
}

export function assertPlaywrightReport(report) {
  const stats = report.stats;
  require(stats &&
    stats.expected >= 1 &&
    stats.unexpected === 0 &&
    stats.flaky === 0 &&
    stats.skipped === 0 &&
    report.errors?.length ===
      0, "browser сценарий не пройден с первого запуска");
  const specs = [];
  const visit = (suite) => {
    specs.push(...(suite.specs ?? []));
    for (const child of suite.suites ?? []) visit(child);
  };
  for (const suite of report.suites ?? []) visit(suite);
  require(specs.length > 0 &&
    specs.every(
      (spec) =>
        spec.ok &&
        spec.tests.length > 0 &&
        spec.tests.every(
          (test) =>
            test.status === "expected" &&
            test.results.length === 1 &&
            test.results[0].status === "passed",
        ),
    ), "browser отчёт содержит пропуск или повтор теста");
  const timings = specs.flatMap((spec) =>
    spec.tests.flatMap((test) =>
      (test.results[0].attachments ?? []).filter(
        (attachment) => attachment.name === "cli-process-timing",
      ),
    ),
  );
  require(timings.length === 1 &&
    timings[0].contentType === "application/json" &&
    typeof timings[0].body === "string" &&
    timings[0].body.length <=
      8192, "нет единственного замера запуска CLI процесса");
  const timing = JSON.parse(
    Buffer.from(timings[0].body, "base64").toString("utf8"),
  );
  require(timing.version === 1 &&
    bounded(timing.initialWallMs) &&
    timing.initialWallMs > 0 &&
    bounded(timing.repeatedWallMs) &&
    timing.repeatedWallMs > 0 &&
    timing.processPerCall === true &&
    timing.osCacheReset === false &&
    timing.modelCalls === 0, "неполные или несопоставимые замеры запуска CLI");
  return {
    tests: stats.expected,
    skipped: 0,
    retries: 0,
    cliProcess: {
      initialWallMs: timing.initialWallMs,
      repeatedWallMs: timing.repeatedWallMs,
      processPerCall: true,
      osCacheReset: false,
      modelCalls: 0,
    },
  };
}

/** Корпус фиксирует точные цели; limit ответа и бюджет чтения проверяются раздельно для каждого вызова. */
export function assertBenchmarkReport(report, kind, runs = limits.runs) {
  const navigation = kind === "navigation";
  require(["navigation", "imports"].includes(kind), "неизвестный corpus");
  require(report.version === 2 &&
    report.runs === runs &&
    report.modelCalls === 0 &&
    report.modelTokens === null, "неверный benchmark protocol");
  const corpus = navigation
    ? repositoryNavigationCorpus
    : [...importResolutionCorpus, ...importResolutionRefusals];
  const assertRows = (rows, scenarios, workflow = false) => {
    require(Array.isArray(rows) &&
      rows.length === scenarios.length * 2 * runs, "неполный benchmark corpus");
    for (let run = 1; run <= runs; run++)
      for (const source of ["cli", "mcp"])
        for (const scenario of scenarios) {
          const selected = rows.filter(
            (row) =>
              row.id === scenario.id &&
              row.source === source &&
              row.run === run,
          );
          require(selected.length ===
            1, `нет единственного результата ${scenario.id}/${source}/${run}`);
          const row = selected[0];
          require(workflow || !navigation
            ? row.passed === true
            : row.fileHit === true &&
                row.anchorHit ===
                  true, `не найдена цель ${scenario.id}/${source}/${run}`);
          require(row.calls === (workflow ? 3 : 1), "лишние вызовы поиска");
          const stages = workflow ? row.stages : [row];
          require(stages.length ===
            (workflow ? 3 : 1), "неполный developer workflow");
          for (const [index, stage] of stages.entries()) {
            const readLimit =
              navigation || (workflow && index > 0)
                ? limits.navigationReadBytes
                : limits.importReadBytes;
            require(!stage.failure &&
              bounded(stage.bytesRead, readLimit) &&
              bounded(stage.outputBytes, limits.responseBytes) &&
              bounded(stage.filesRead) &&
              bounded(
                stage.durationMs,
              ), `ошибка или превышение бюджета ${scenario.id}/${source}/${run}`);
            const coverage = stage.coverage;
            require(coverage?.precision === "syntax" &&
              ["parsedFiles", "prefilteredFiles", "unsupportedFiles"].every(
                (key) =>
                  Number.isSafeInteger(coverage[key]) && coverage[key] >= 0,
              ) &&
              coverage.skippedFiles === 0 &&
              coverage.syntaxErrorFiles ===
                0, `неполное покрытие синтаксиса ${scenario.id}/${source}/${run}`);
            if (!navigation && (!workflow || index === 0))
              require(stage.resolution?.exhausted ===
                false, `исчерпан или отсутствует бюджет import lookup ${scenario.id}`);
            // Только последние стадии workflow допускают ограниченную страницу с явной причиной.
            const paginated =
              workflow &&
              index > 0 &&
              stage.partial === true &&
              (source === "cli"
                ? ["limit", "bytes"]
                : ["page_limit", "response_bytes"]
              ).includes(stage.partialReason);
            require(paginated ||
              (stage.partial === false &&
                stage.partialReason ===
                  null), `неполный lookup или необъяснённое усечение ${scenario.id}/${source}/${run}`);
          }
        }
  };
  assertRows(report.rows, corpus);
  if (!navigation)
    assertRows(report.workflows, importResolutionWorkflows, true);
  return {
    scenarios: corpus.length,
    runs,
    adapters: ["cli", "mcp"],
    workflows: navigation ? 0 : importResolutionWorkflows.length,
  };
}
