/**
 * @file .ai/tools/codex-request-diagnostics/test/smokeCoverage.test.ts
 * @version 1.0.0
 * @date 2026-11-20
 * @description Проверяет закрытую диагностику reader без сохранения command и stdout.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { Readable, Writable } from "node:stream";
import { SmokeCoverage } from "../src/smokeCoverage.service.ts";
import {
  FIRST_INSPECT_COMMAND,
  INSPECT_COMMAND,
} from "../src/smokeAssignment.constants.ts";
import { renderGitInspectSummary } from "../../git-delivery/src/worker/renderGitInspectSummary.controller.ts";

const command = "node .ai/tools/context-reading/read-context.mjs '[]'";
const source = { path: "README.md", first: 1, last: 1, lines: ["public\n"] };
const output = JSON.stringify({
  sources: [{ path: source.path, startLine: 1, endLine: 1, text: "public\n" }],
  pending: [],
});
const observe = (
  coverage: SmokeCoverage,
  overrides: Record<string, unknown> = {},
) =>
  coverage.observe({
    type: "commandExecution",
    command,
    aggregatedOutput: output,
    exitCode: 0,
    status: "completed",
    ...overrides,
  });

test("failed reader сохраняет лишь известный enum и прежние invalidReads", () => {
  for (const errorCode of ["INVALID_INPUT", "READ_FAILED", "LINE_TOO_LARGE"]) {
    const coverage = new SmokeCoverage([source]);
    const canary = "PRIVATE_COMMAND_STDOUT_CANARY";
    observe(coverage, {
      command: `${command} ${canary}`,
      aggregatedOutput: `read-context: ${errorCode}\n${canary}\n`,
      status: "failed",
      exitCode: 1,
    });
    const snapshot = coverage.snapshot();
    assert.equal(snapshot.invalidReads, 2);
    assert.equal(snapshot.readerDiagnostics[0].errorCode, errorCode);
    assert.equal(snapshot.readerDiagnostics[0].status, "failed");
    assert.equal(snapshot.readerDiagnostics[0].exitCode, 1);
    assert.deepEqual(snapshot.readerDiagnostics[0].reasons, [
      "execution_failed",
      "packet_invalid",
    ]);
    assert.equal(JSON.stringify(snapshot).includes(canary), false);
    assert.equal(JSON.stringify(snapshot).includes(command), false);
  }
});

test("успешный packet не получает ошибку, неизвестный текст не становится enum", () => {
  const coverage = new SmokeCoverage([source]);
  observe(coverage);
  assert.equal(coverage.snapshot().invalidReads, 0);
  assert.equal(coverage.snapshot().readLines, 1);
  assert.deepEqual(coverage.snapshot().readerDiagnostics[0].reasons, []);
  assert.equal(coverage.snapshot().readerDiagnostics[0].errorCode, null);
  observe(coverage, {
    aggregatedOutput: "read-context: UNKNOWN_PRIVATE_ERROR\n",
    exitCode: 2,
  });
  assert.equal(coverage.snapshot().readerDiagnostics[1].errorCode, null);
  assert.equal(
    JSON.stringify(coverage.snapshot()).includes("UNKNOWN_PRIVATE_ERROR"),
    false,
  );
});

test("command gate и truncation остаются строгими без хранения raw полей", () => {
  const coverage = new SmokeCoverage([source]);
  observe(coverage, {
    command: `${command} && PRIVATE_COMMAND_CANARY`,
    aggregatedOutput: "Warning: truncated output PRIVATE_STDOUT_CANARY",
    status: "PRIVATE_STATUS_CANARY",
    exitCode: "PRIVATE_EXIT_CANARY",
  });
  const snapshot = coverage.snapshot();
  assert.equal(snapshot.invalidReads, 2);
  assert.equal(snapshot.readerDiagnostics[0].status, "unknown");
  assert.equal(snapshot.readerDiagnostics[0].exitCode, null);
  assert.deepEqual(snapshot.readerDiagnostics[0].reasons, [
    "execution_failed",
    "output_truncated",
    "command_not_allowed",
  ]);
  assert.equal(JSON.stringify(snapshot).includes("PRIVATE_"), false);
});

test("диагностика ограничена 32 вызовами, оставшиеся учитываются счётчиком", () => {
  const coverage = new SmokeCoverage([source]);
  for (let i = 0; i < 35; i++) observe(coverage);
  const snapshot = coverage.snapshot();
  assert.equal(snapshot.reads, 35);
  assert.equal(snapshot.readerDiagnostics.length, 32);
  assert.equal(snapshot.readerDiagnosticsDropped, 3);
  assert.equal(snapshot.readerDiagnostics[31].call, 32);
  assert.equal(snapshot.invalidReads, 0);
});

function report(truncated = true) {
  return {
    version: 1,
    status: "succeeded",
    errorCode: null,
    command: { action: "inspect" },
    metadata: "PRIVATE_TOP_METADATA_CANARY",
    result: {
      version: 1,
      action: "inspect",
      status: "succeeded",
      errorCode: null,
      requestId: "PRIVATE_REQUEST_CANARY",
      branch: "PRIVATE_BRANCH_CANARY",
      commit: "PRIVATE_HEAD_CANARY",
      fingerprint: "PRIVATE_FINGERPRINT_CANARY",
      commitCreated: false,
      pushStatus: "not_requested",
      retryable: false,
      summary: "PRIVATE_SUMMARY_CANARY",
      checks: [],
      metadata: "PRIVATE_RESULT_METADATA_CANARY",
      changes: {
        items: [
          { path: "PRIVATE_PATH_CANARY", status: "PRIVATE_STATUS_CANARY" },
          { path: "PRIVATE_OTHER_PATH_CANARY", status: "__proto__" },
        ],
        truncated,
      },
    },
    worker: {
      model: null,
      threadId: null,
      turnId: null,
      instructionBytes: 0,
      handlerCalls: 1,
      durationMs: 7,
      usage: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 },
    },
  };
}

/** Исполняет только renderer в RAM: producer streams не запускают subprocess или Git. */
async function render(raw: Buffer, maxBytes?: number) {
  const chunks: Buffer[] = [];
  const output = new Writable({
    write(chunk, _encoding, done) {
      chunks.push(Buffer.from(chunk));
      done();
    },
  });
  await renderGitInspectSummary(Readable.from([raw]), output, maxBytes);
  return Buffer.concat(chunks);
}

function inspect(output: string, command = INSPECT_COMMAND) {
  const coverage = new SmokeCoverage([source]);
  observe(coverage, { command, aggregatedOutput: output });
  return coverage.snapshot();
}

test("реальный RAM renderer сохраняет metadata, а inspect diagnostics только размеры и counts", async () => {
  for (const truncated of [true, false]) {
    const original = report(truncated);
    const rendered = await render(Buffer.from(JSON.stringify(original) + "\n"));
    const projected = JSON.parse(rendered.toString("utf8"));
    assert.ok(projected.metadata === original.metadata);
    assert.ok(projected.result.metadata === original.result.metadata);
    assert.ok(projected.result.summary === original.result.summary);
    assert.ok(projected.result.requestId === original.result.requestId);
    assert.ok(projected.result.branch === original.result.branch);
    assert.ok(projected.result.commit === original.result.commit);
    assert.ok(projected.result.fingerprint === original.result.fingerprint);
    assert.deepEqual(projected.worker, original.worker);
    assert.equal(Object.hasOwn(projected.result.changes, "items"), false);
    const output = truncated
      ? rendered.toString("utf8")
      : "public runtime verified\n" + rendered;
    const snapshot = inspect(
      output,
      truncated
        ? INSPECT_COMMAND
        : "npm run verify:runtime && " + INSPECT_COMMAND,
    );
    assert.equal(snapshot.inspectCount, 1);
    assert.equal(snapshot.inspectSuccessfulCount, 1);
    assert.equal(snapshot.inspectSucceeded, true);
    assert.equal(snapshot.inspectCompactCount, 1);
    assert.equal(snapshot.modelWorkerUsed, false);
    assert.equal(snapshot.invalidReads, 0);
    assert.deepEqual(snapshot.inspectDiagnostics, [
      {
        call: 1,
        outputBytes: Buffer.byteLength(output),
        reportBytes: rendered.length - 1,
        reportCount: 1,
        projectionKind: "git-inspect-summary",
        normalized: true,
        reportedCount: 2,
        statusGroups: 2,
        statusCountSum: 2,
        truncated,
        totalCount: truncated ? null : 2,
        pathsOmitted: true,
      },
    ]);
    assert.equal(JSON.stringify(snapshot).includes("PRIVATE_"), false);
    assert.equal(JSON.stringify(snapshot).includes("__proto__"), false);
  }
});

test("raw success, errors, unknown и overflow проходят renderer побайтно, но не считаются compact", async () => {
  const failed = {
    ...report(),
    status: "failed",
    errorCode: "PRIVATE_ERROR_CANARY",
  };
  const unknownItem = report();
  Object.assign(unknownItem.result.changes.items[0], {
    metadata: "PRIVATE_CHANGE_CANARY",
  });
  for (const raw of [
    Buffer.from(
      JSON.stringify(failed, null, 2).replaceAll("\n", "\r\n") + "\r\n",
    ),
    Buffer.from('{"PRIVATE_UNKNOWN_CANARY":true}\n'),
    Buffer.from([0xff, 0x0d, 0x0a]),
    Buffer.from(JSON.stringify(unknownItem) + "\n"),
  ]) {
    const rendered = await render(raw);
    assert.ok(
      rendered.equals(raw),
      "renderer changed an unprojectable response",
    );
    const snapshot = inspect(rendered.toString("utf8"));
    assert.equal(snapshot.inspectCompactCount, 0);
    assert.equal(snapshot.inspectDiagnostics[0].normalized, false);
    assert.equal(JSON.stringify(snapshot).includes("PRIVATE_"), false);
  }
  const raw = Buffer.from(JSON.stringify(report()) + "\n");
  assert.ok(
    (await render(raw, 1)).equals(raw),
    "renderer overflow changed bytes",
  );
  const snapshot = inspect(raw.toString("utf8"));
  assert.equal(snapshot.inspectSucceeded, true);
  assert.equal(snapshot.inspectCompactCount, 0);
  assert.equal(snapshot.inspectDiagnostics[0].projectionKind, null);
});

test("compact validation отвергает противоречивые counts, marker, items и повторные reports", async () => {
  const valid = JSON.parse(
    (await render(Buffer.from(JSON.stringify(report())))).toString("utf8"),
  );
  const variants = [
    (value: any) => {
      value.projection.kind = "PRIVATE_KIND_CANARY";
    },
    (value: any) => {
      value.projection.version = 2;
    },
    (value: any) => {
      value.version = 2;
    },
    (value: any) => {
      value.result.errorCode = "PRIVATE_ERROR_CANARY";
    },
    (value: any) => {
      value.worker.handlerCalls = 2;
    },
    (value: any) => {
      value.result.changes.items = [];
    },
    (value: any) => {
      value.result.changes.pathsOmitted = false;
    },
    (value: any) => {
      value.result.changes.reportedCount = -1;
    },
    (value: any) => {
      value.result.changes.statusCounts = { PRIVATE_STATUS_CANARY: 1 };
    },
    (value: any) => {
      value.result.changes.statusCounts = {
        PRIVATE_STATUS_CANARY: Number.MAX_SAFE_INTEGER,
        other: 1,
      };
    },
    (value: any) => {
      value.result.changes.totalCount = 2;
    },
    (value: any) => {
      value.result.changes.truncated = false;
      value.result.changes.totalCount = 1;
    },
  ];
  for (const mutate of variants) {
    const value = structuredClone(valid);
    mutate(value);
    const snapshot = inspect(JSON.stringify(value) + "\n");
    assert.equal(snapshot.inspectCompactCount, 0);
    assert.equal(snapshot.inspectDiagnostics[0].normalized, false);
    assert.equal(JSON.stringify(snapshot).includes("PRIVATE_"), false);
  }
  const repeated = inspect(
    JSON.stringify(valid) + "\n" + JSON.stringify(valid) + "\n",
  );
  assert.equal(repeated.inspectCompactCount, 0);
  assert.equal(repeated.inspectDiagnostics[0].reportCount, 2);
  assert.equal(repeated.inspectDiagnostics[0].reportBytes, null);
});

test("новый профиль допускает лишь точный pipeline и ограничивает inspect diagnostics 32 записями", async () => {
  const output = (await render(Buffer.from(JSON.stringify(report())))).toString(
    "utf8",
  );
  for (const command of [
    "npm run --silent git:worker -- inspect",
    "npm run verify:runtime && npm run --silent git:worker -- inspect",
    INSPECT_COMMAND + " && PRIVATE_COMMAND_CANARY",
  ]) {
    const snapshot = inspect(output, command);
    assert.equal(snapshot.invalidReads, 1);
    assert.equal(snapshot.inspectCompactCount, 0);
    assert.equal(snapshot.inspectDiagnostics[0].normalized, false);
    assert.equal(JSON.stringify(snapshot).includes("PRIVATE_"), false);
  }
  const coverage = new SmokeCoverage([source]);
  for (let i = 0; i < 35; i++)
    observe(coverage, { command: INSPECT_COMMAND, aggregatedOutput: output });
  const snapshot = coverage.snapshot();
  assert.equal(snapshot.inspectCount, 35);
  assert.equal(snapshot.inspectCompactCount, 35);
  assert.equal(snapshot.inspectDiagnostics.length, 32);
  assert.equal(snapshot.inspectDiagnosticsDropped, 3);
  assert.equal(snapshot.inspectDiagnostics[31].call, 32);
  assert.deepEqual(snapshot.readerDiagnostics, []);
  assert.equal(JSON.stringify(snapshot).includes("PRIVATE_"), false);
});

test("runtime считается выполненным только по exact command, exit и marker; повтор не скрывается", async () => {
  const rendered = (
    await render(Buffer.from(JSON.stringify(report())))
  ).toString("utf8");
  const runtime =
    "[runtime] Node.js 24.18.0; npm 11.15.0; runtime и pins: OK\n";
  const combined = inspect(runtime + rendered, FIRST_INSPECT_COMMAND);
  assert.equal(combined.commands, 1);
  assert.equal(combined.runtimeChecks, 1);
  assert.equal(combined.runtimeChecksPassed, 1);
  assert.equal(combined.runtimeChecksCombined, 1);
  assert.equal(combined.invalidReads, 0);
  assert.equal(combined.inspectCompactCount, 1);
  assert.equal(inspect(rendered, FIRST_INSPECT_COMMAND).runtimeChecksPassed, 0);
  assert.equal(inspect(runtime + rendered, INSPECT_COMMAND).runtimeChecks, 0);
  const failed = new SmokeCoverage([source]);
  observe(failed, {
    command: FIRST_INSPECT_COMMAND,
    aggregatedOutput: runtime,
    exitCode: 1,
    status: "failed",
  });
  assert.equal(failed.snapshot().runtimeChecksPassed, 0);
  assert.equal(failed.snapshot().inspectCompactCount, 0);
  const repeated = new SmokeCoverage([source]);
  for (let i = 0; i < 2; i++)
    observe(repeated, {
      command: FIRST_INSPECT_COMMAND,
      aggregatedOutput: runtime + rendered,
    });
  assert.equal(repeated.snapshot().runtimeChecks, 2);
  assert.equal(repeated.snapshot().invalidReads, 1);
  const standalone = new SmokeCoverage([source]);
  observe(standalone, {
    command: "npm run verify:runtime",
    aggregatedOutput: runtime,
  });
  assert.equal(standalone.snapshot().runtimeChecksPassed, 1);
  assert.equal(standalone.snapshot().runtimeChecksCombined, 0);
});
