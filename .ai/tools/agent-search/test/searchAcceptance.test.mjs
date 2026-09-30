/**
 * @file .ai/tools/agent-search/test/searchAcceptance.test.mjs
 * @version 1.0.0
 * @date 2026-09-29
 * @description Проверяет отказ неполной приёмки, защиту БД и завершение зависших процессов без утечки логов.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, readFile } from "node:fs/promises";
import { once } from "node:events";
import { join } from "node:path";
import { SearchAcceptanceProcess } from "../acceptance/SearchAcceptanceProcess.adapter.mjs";
import { validateAcceptanceDatabaseService } from "../acceptance/createSearchAcceptanceDatabase.adapter.mjs";
import {
  assertNodeReport,
  assertVitestReport,
  assertPlaywrightReport,
  assertBenchmarkReport,
} from "../acceptance/assertSearchAcceptanceReport.validator.mjs";
import { repositoryNavigationCorpus } from "../benchmark/repositoryNavigation.corpus.mjs";
import {
  importResolutionCorpus,
  importResolutionRefusals,
  importResolutionWorkflows,
} from "../benchmark/importResolution.corpus.mjs";

test("acceptance refuses ambient, remote and non-fixture PostgreSQL services", () => {
  const service = "postgres://fixture:fixture@127.0.0.1:5432/realize_ci";
  assert.equal(
    validateAcceptanceDatabaseService(service, true).pathname,
    "/realize_ci",
  );
  for (const ci of [false, "false", undefined])
    assert.throws(() => validateAcceptanceDatabaseService(service, ci));
  for (const value of [
    service.replace("realize_ci", "production"),
    service.replace("127.0.0.1", "localhost"),
    service.replace("5432", "55432"),
    `${service}?options=-csearch_path=public`,
    service.replace("postgres:", "https:"),
  ])
    assert.throws(() => validateAcceptanceDatabaseService(value, true));
});

test("acceptance rejects skipped, empty and missing mandatory test files", () => {
  const tap =
    "# tests 2\n# pass 2\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n";
  assert.equal(assertNodeReport(tap, 2).tests, 2);
  for (const value of [
    "",
    tap.replace("skipped 0", "skipped 1"),
    tap.replace("pass 2", "pass 1"),
  ])
    assert.throws(() => assertNodeReport(value, 2));
  const report = {
    success: true,
    numTotalTests: 1,
    numPassedTests: 1,
    numFailedTests: 0,
    numPendingTests: 0,
    testResults: [
      {
        name: "/repo/tests/a.ts",
        status: "passed",
        assertionResults: [{ status: "passed" }],
      },
    ],
  };
  const suite = { minimum: 1, files: ["tests/a.ts"] };
  assert.equal(assertVitestReport(report, suite).passed, 1);
  assert.throws(() =>
    assertVitestReport({ ...report, numPendingTests: 1 }, suite),
  );
  assert.throws(() =>
    assertVitestReport(report, { ...suite, files: ["tests/b.ts"] }),
  );
  assert.throws(() =>
    assertVitestReport({ ...report, testResults: [] }, suite),
  );
  assert.throws(() =>
    assertPlaywrightReport({
      stats: { expected: 0, unexpected: 0, flaky: 0, skipped: 0 },
      errors: [],
      suites: [],
    }),
  );
  assert.throws(() =>
    assertPlaywrightReport({
      stats: { expected: 1, unexpected: 0, flaky: 1, skipped: 0 },
      errors: [],
    }),
  );
});

test("browser gate requires real process timings even when the scenario passed", () => {
  const timing = {
    version: 1,
    initialWallMs: 400,
    repeatedWallMs: 200,
    processPerCall: true,
    osCacheReset: false,
    modelCalls: 0,
  };
  const attachment = (value) => ({
    name: "cli-process-timing",
    contentType: "application/json",
    body: Buffer.from(JSON.stringify(value)).toString("base64"),
  });
  const report = (attachments) => ({
    stats: { expected: 1, unexpected: 0, flaky: 0, skipped: 0 },
    errors: [],
    suites: [
      {
        specs: [
          {
            ok: true,
            tests: [
              {
                status: "expected",
                results: [{ status: "passed", attachments }],
              },
            ],
          },
        ],
      },
    ],
  });
  assert.equal(
    assertPlaywrightReport(report([attachment(timing)])).cliProcess
      .initialWallMs,
    400,
  );
  for (const attachments of [
    [],
    [attachment(timing), attachment(timing)],
    [attachment({ ...timing, initialWallMs: null })],
    [attachment({ ...timing, repeatedWallMs: -1 })],
    [attachment({ ...timing, processPerCall: false })],
    [attachment({ ...timing, modelCalls: 1 })],
  ])
    assert.throws(() => assertPlaywrightReport(report(attachments)));
});

test("benchmark gate catches duplicate coverage, misses and independent read/output overruns", () => {
  const complete = {
    bytesRead: 10,
    outputBytes: 10,
    filesRead: 1,
    durationMs: 1,
    failure: null,
    partial: false,
    partialReason: null,
    coverage: {
      precision: "syntax",
      parsedFiles: 1,
      prefilteredFiles: 0,
      unsupportedFiles: 0,
      skippedFiles: 0,
      syntaxErrorFiles: 0,
    },
  };
  const report = {
    version: 2,
    runs: 1,
    modelCalls: 0,
    modelTokens: null,
    rows: repositoryNavigationCorpus.flatMap((scenario) =>
      ["cli", "mcp"].map((source) => ({
        id: scenario.id,
        source,
        run: 1,
        calls: 1,
        fileHit: true,
        anchorHit: true,
        ...complete,
      })),
    ),
  };
  assert.equal(assertBenchmarkReport(report, "navigation", 1).scenarios, 24);
  for (const change of [
    { anchorHit: false },
    { bytesRead: 52428801 },
    { outputBytes: 8193 },
    { filesRead: null },
    { calls: 2 },
    { partial: true, partialReason: "limit" },
    { coverage: null },
    { coverage: { ...complete.coverage, skippedFiles: 1 } },
    { coverage: { ...complete.coverage, syntaxErrorFiles: 1 } },
  ]) {
    const invalid = structuredClone(report);
    Object.assign(invalid.rows[0], change);
    assert.throws(() => assertBenchmarkReport(invalid, "navigation", 1));
  }
  const duplicate = structuredClone(report);
  duplicate.rows[0] = duplicate.rows[1];
  assert.throws(() => assertBenchmarkReport(duplicate, "navigation", 1));

  const imports = {
    ...report,
    rows: [...importResolutionCorpus, ...importResolutionRefusals].flatMap(
      (scenario) =>
        ["cli", "mcp"].map((source) => ({
          ...complete,
          id: scenario.id,
          source,
          run: 1,
          calls: 1,
          passed: true,
          resolution: { exhausted: false },
        })),
    ),
    workflows: importResolutionWorkflows.flatMap((scenario) =>
      ["cli", "mcp"].map((source) => ({
        id: scenario.id,
        source,
        run: 1,
        calls: 3,
        passed: true,
        stages: [
          { ...complete, resolution: { exhausted: false } },
          { ...complete },
          {
            ...complete,
            partial: true,
            partialReason: source === "cli" ? "limit" : "page_limit",
          },
        ],
      })),
    ),
  };
  assert.equal(assertBenchmarkReport(imports, "imports", 1).scenarios, 16);
  for (const index of [0, 2]) {
    const invalid = structuredClone(imports);
    Object.assign(invalid.workflows[0].stages[index], {
      partial: true,
      partialReason: "scan_budget",
    });
    assert.throws(() => assertBenchmarkReport(invalid, "imports", 1));
  }
  const exhausted = structuredClone(imports);
  exhausted.rows[0].resolution.exhausted = true;
  assert.throws(() => assertBenchmarkReport(exhausted, "imports", 1));
});

test("process lifecycle redacts split output and awaits forced shutdown of an owned child", async (t) => {
  const tasks = join(
    process.cwd(),
    process.cwd().endsWith("agent-search")
      ? "../../../.ai-workspace/tasks"
      : ".ai-workspace/tasks",
  );
  await mkdir(tasks, { recursive: true });
  const dir = await mkdtemp(
    join(tasks, `${new Date().toISOString().slice(0, 10)}-acceptance-process-`),
  );
  const processes = new SearchAcceptanceProcess(dir, {
    PATH: process.env.PATH,
  });
  t.after(async () => {
    await processes.close();
    await rm(dir, { recursive: true, force: true });
  });
  processes.secrets.add("fixture-secret");
  const result = await processes.run("redaction", process.execPath, [
    "-e",
    "process.stdout.write('fixture-'); process.stderr.write('stderr'); setTimeout(()=>process.stdout.write('secret'), 20)",
  ]);
  assert.equal(result, "[redacted]");
  // Потоки могут перемежаться: секреты в одном потоке должны маскироваться и в общем журнале.
  const child = await processes.start(
    "stuck",
    process.execPath,
    [
      "-e",
      "process.on('SIGTERM',()=>{}); console.log('ready'); setInterval(()=>{},1000)",
    ],
    { killAfterMs: 50 },
  );
  await once(child.child.stdout, "data");
  await processes.close();
  assert.equal(child.child.signalCode, "SIGKILL");
  assert.equal(processes.children.size, 0);
  assert.ok(
    !(await readFile(join(dir, "redaction.log"), "utf8")).includes(
      "fixture-secret",
    ),
  );
  const deadline = await processes.start(
    "deadline",
    process.execPath,
    ["-e", "setInterval(()=>{},1000)"],
    { timeoutMs: 150, killAfterMs: 50 },
  );
  assert.match((await deadline.done).failure.message, /время/);
  const controller = new AbortController();
  const other = new SearchAcceptanceProcess(
    dir,
    { PATH: process.env.PATH },
    controller.signal,
  );
  t.after(() => other.close());
  const foreign = await other.start("foreign", process.execPath, [
    "-e",
    "console.log('ready');setInterval(()=>{},1000)",
  ]);
  await once(foreign.child.stdout, "data");
  processes.terminate(foreign.child);
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(foreign.child.signalCode, null);
  controller.abort();
  assert.match((await foreign.done).failure.message, /отменена/);
  await assert.rejects(() => other.start("aborted", process.execPath, []), {
    name: "AbortError",
  });
  const descendant = "process.on('SIGTERM',()=>{});setInterval(()=>{},1000)";
  const leader = await processes.start(
    "descendant",
    process.execPath,
    [
      "-e",
      `const {spawn}=require('node:child_process');spawn(process.execPath,['-e',${JSON.stringify(descendant)}],{stdio:['ignore','inherit','inherit']}).unref();setTimeout(()=>process.exit(0),150)`,
    ],
    { killAfterMs: 50 },
  );
  await once(leader.child, "exit");
  await processes.stop(leader);
  assert.equal(processes.children.size, 0);
});
