/**
 * @file .ai/tools/codex-request-diagnostics/test/contextReadingSmoke.test.ts
 * @version 1.0.0
 * @date 2026-11-20
 * @description Проверяет reader manifest и fail-closed grouping первого inspect без Codex и Git.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  BOOTSTRAP_READ_COMMAND,
  BOOTSTRAP_READ_SELECTIONS,
  EXPECTED_READER_CALLS,
  FIRST_INSPECT_COMMAND,
  FULL_ASSIGNMENT,
  INSPECT_COMMAND,
} from "../src/smokeAssignment.constants.ts";
import {
  loadSmokeSources,
  SmokeCoverage,
} from "../src/smokeCoverage.service.ts";

const cwd = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const reader = ".ai/tools/context-reading/read-context.mjs";
const maxBytes = 12288;
type NumericSelection = {
  path: string;
  startLine: number;
  endLine: number | null;
};
type Selection = NumericSelection | { path: string; section: string };
interface Packet {
  sources: {
    path: string;
    startLine: number;
    endLine: number;
    text: string;
  }[];
  pending: NumericSelection[];
}

/** Запускает только public readonly reader; raw output остаётся в RAM и не входит в failure messages. */
function invoke(selections: unknown) {
  const result = spawnSync(
    process.execPath,
    [reader, JSON.stringify(selections)],
    {
      cwd,
      encoding: "utf8",
      timeout: 5000,
      maxBuffer: maxBytes + 256,
    },
  );
  assert.ok(!result.error, "reader process failed before a result");
  assert.equal(result.signal, null);
  return result;
}

function packet(selections: readonly Selection[]): {
  value: Packet;
  output: string;
} {
  const result = invoke(selections);
  assert.equal(result.status, 0, "reader returned a fixed failure code");
  assert.ok(result.stderr === "", "successful reader emitted stderr");
  assert.ok(
    Buffer.byteLength(result.stdout) <= maxBytes,
    "packet exceeds UTF-8 budget",
  );
  let value: Packet;
  try {
    value = JSON.parse(result.stdout);
  } catch {
    assert.fail("reader did not return one JSON packet");
  }
  assert.ok(Array.isArray(value.sources));
  assert.ok(value.sources.length >= 1 && value.sources.length <= 3);
  assert.ok(Array.isArray(value.pending));
  assert.ok(value.pending.length <= 3);
  for (const pending of value.pending) {
    assert.deepEqual(Object.keys(pending).sort(), [
      "endLine",
      "path",
      "startLine",
    ]);
    assert.ok(
      Number.isSafeInteger(pending.startLine) && pending.startLine >= 1,
    );
    assert.ok(Number.isSafeInteger(pending.endLine));
    assert.ok(pending.endLine! >= pending.startLine);
  }
  return { value, output: result.stdout };
}

test("первый smoke reader call имеет literal JSON из трёх полных bootstrap sources", () => {
  assert.deepEqual(BOOTSTRAP_READ_SELECTIONS, [
    { path: "README.md", startLine: 1, endLine: null },
    { path: ".ai/README.md", startLine: 1, endLine: null },
    { path: ".ai/registry/rules/global/INDEX.md", startLine: 1, endLine: null },
  ]);
  const json = JSON.stringify(BOOTSTRAP_READ_SELECTIONS);
  assert.ok(
    !json.includes("'"),
    "bootstrap JSON requires a different shell quote contract",
  );
  assert.equal(BOOTSTRAP_READ_COMMAND, `node ${reader} '${json}'`);
  assert.ok(FULL_ASSIGNMENT.includes(BOOTSTRAP_READ_COMMAND));
  const result = packet(BOOTSTRAP_READ_SELECTIONS);
  assert.equal(result.value.sources[0].path, "README.md");
  assert.equal(result.value.sources[0].startLine, 1);
  assert.ok(
    result.value.pending.length > 0,
    "fixture must exercise continuation",
  );
});

test("common assignment оставляет one/three scope финальному tail и задаёт первый grouped inspect", () => {
  assert.equal(
    FIRST_INSPECT_COMMAND,
    "npm run verify:runtime && " + INSPECT_COMMAND,
  );
  assert.equal(FULL_ASSIGNMENT.includes("Разрешён один inspect"), false);
  assert.equal(FULL_ASSIGNMENT.includes("Разрешены три inspect"), false);
  assert.equal(FULL_ASSIGNMENT.includes("\\n"), false);
  const lines = FULL_ASSIGNMENT.split("\n");
  assert.equal(
    lines.filter((line) => line === FIRST_INSPECT_COMMAND).length,
    1,
  );
  assert.equal(lines.filter((line) => line === INSPECT_COMMAND).length, 1);
  assert.ok(
    lines.indexOf(FIRST_INSPECT_COMMAND) >
      lines.indexOf(BOOTSTRAP_READ_COMMAND),
  );
});

test("FIRST pipeline: verify failure не запускает producer; pipefail сохраняет producer failure", () => {
  const compact = JSON.stringify({
    version: 1,
    command: { action: "inspect" },
    status: "succeeded",
    errorCode: null,
    projection: { kind: "git-inspect-summary", version: 1 },
    result: {
      version: 1,
      action: "inspect",
      status: "succeeded",
      errorCode: null,
      requestId: null,
      branch: null,
      commit: null,
      fingerprint: null,
      commitCreated: false,
      pushStatus: "not_requested",
      retryable: false,
      summary: "fixture",
      checks: [],
      changes: {
        reportedCount: 0,
        statusCounts: {},
        totalCount: 0,
        pathsOmitted: true,
        truncated: false,
      },
    },
    worker: {
      model: null,
      threadId: null,
      turnId: null,
      instructionBytes: 0,
      handlerCalls: 1,
      durationMs: 0,
      usage: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 },
    },
  });
  // Только shell functions: реальные npm, Git и renderer/model здесь не запускаются.
  const stubs = `
npm() {
  case "$*" in
    "run verify:runtime")
      printf 'runtime verified\\n'
      return "$SMOKE_VERIFY_EXIT" ;;
    "run --silent git:worker -- inspect")
      printf 'synthetic producer\\n'
      return "$SMOKE_PRODUCER_EXIT" ;;
    *) return 97 ;;
  esac
}
node() {
  [ "$*" = "--import=tsx/esm .ai/tools/git-delivery/src/worker/renderGitInspectSummary.controller.ts" ] || return 98
  local seen=0 line
  while IFS= read -r line; do
    [ "$line" = "synthetic producer" ] && seen=1
  done
  [ "$seen" = 1 ] || return 99
  printf '%s\\n' "$SMOKE_COMPACT_REPORT"
  return 0
}
`;
  for (const [verifyExit, producerExit, expectedExit] of [
    [23, 0, 23],
    [0, 19, 19],
    [0, 0, 0],
  ]) {
    const result = spawnSync(
      "/bin/bash",
      ["--noprofile", "--norc", "-c", stubs + FIRST_INSPECT_COMMAND],
      {
        cwd,
        encoding: "utf8",
        timeout: 5000,
        maxBuffer: 8192,
        env: {
          SMOKE_VERIFY_EXIT: String(verifyExit),
          SMOKE_PRODUCER_EXIT: String(producerExit),
          SMOKE_COMPACT_REPORT: compact,
        },
      },
    );
    assert.ok(!result.error, "synthetic pipeline failed before a result");
    assert.equal(result.signal, null);
    assert.equal(result.status, expectedExit);
    assert.equal(result.stderr, "");
    assert.equal(
      result.stdout,
      "runtime verified\n" + (verifyExit ? "" : compact + "\n"),
    );
    assert.ok(Buffer.byteLength(result.stdout) <= 4096);
    assert.equal(result.stdout.includes("Warning: truncated output"), false);
  }
});

test("ordered queue читает manifest за шесть пакетов; локальный underfill call3 требует седьмой", (t) => {
  const sources = loadSmokeSources(cwd);
  const bootstrap = new Set<string>(
    BOOTSTRAP_READ_SELECTIONS.map((row) => row.path),
  );
  function route(underfillThird: boolean) {
    const coverage = new SmokeCoverage(sources);
    const remaining: Selection[] = sources
      .filter((source) => !bootstrap.has(source.path))
      .map((source) =>
        source.section
          ? { path: source.path, section: source.section }
          : { path: source.path, startLine: 1, endLine: null },
      );
    const metadata: {
      input: Selection[];
      pending: NumericSelection[];
      outputBytes: number;
    }[] = [];
    let selections: readonly Selection[] = BOOTSTRAP_READ_SELECTIONS;
    while (selections.length) {
      assert.ok(metadata.length < 100, "reader continuation did not terminate");
      const read = packet(selections);
      metadata.push({
        input: selections.map((row) => ({ ...row })),
        pending: read.value.pending.map((row) => ({ ...row })),
        outputBytes: Buffer.byteLength(read.output),
      });
      const before = coverage.snapshot().readLines;
      coverage.observe({
        type: "commandExecution",
        command: `node ${reader} '${JSON.stringify(selections)}'`,
        status: "completed",
        exitCode: 0,
        aggregatedOutput: read.output,
      });
      const after = coverage.snapshot();
      assert.equal(
        after.invalidReads,
        0,
        "manifest packet failed source proof",
      );
      assert.equal(after.duplicateLines, 0);
      assert.ok(
        after.readLines > before,
        "reader continuation made no progress",
      );
      // Контрфактический маршрут отличается только незаполненным слотом перед call3.
      const free =
        underfillThird && metadata.length === 2
          ? 0
          : 3 - read.value.pending.length;
      selections = [...read.value.pending, ...remaining.splice(0, free)];
    }
    return { coverage: coverage.snapshot(), metadata };
  }
  const optimized = route(false);
  const underfilled = route(true);
  const expectedLines = sources.reduce(
    (sum, source) => sum + source.last - source.first + 1,
    0,
  );
  assert.equal(expectedLines, 788);
  assert.equal(EXPECTED_READER_CALLS, 6);
  assert.equal(optimized.metadata.length, EXPECTED_READER_CALLS);
  assert.equal(underfilled.metadata.length, EXPECTED_READER_CALLS + 1);
  assert.deepEqual(
    optimized.metadata.slice(0, 2),
    underfilled.metadata.slice(0, 2),
  );
  assert.equal(optimized.metadata[1].pending.length, 2);
  assert.deepEqual(optimized.metadata[2].input, [
    ...optimized.metadata[1].pending,
    {
      path: ".ai/rules/global/RULE-GLOBAL-PROJECT-GUARDRAILS.md",
      startLine: 1,
      endLine: null,
    },
  ]);
  assert.deepEqual(
    underfilled.metadata[2].input,
    underfilled.metadata[1].pending,
  );
  assert.equal(optimized.metadata[2].outputBytes, 12226);
  assert.equal(underfilled.metadata[2].outputBytes, 5550);
  for (const { coverage: result, metadata } of [optimized, underfilled]) {
    assert.equal(result.readLines, expectedLines);
    assert.equal(result.pendingCount, 0);
    assert.equal(result.invalidReads, 0);
    assert.equal(result.duplicateLines, 0);
    assert.ok(result.maxPacketBytes <= maxBytes);
    assert.equal(result.reads, metadata.length);
    assert.equal(result.readerDiagnostics.length, metadata.length);
    assert.equal(result.readerDiagnosticsDropped, 0);
    assert.equal(result.inspectCount, 0);
    assert.equal(result.modelWorkerUsed, false);
  }
  t.diagnostic(
    JSON.stringify({
      manifestLines: expectedLines,
      optimizedPackets: optimized.metadata.length,
      underfilledPackets: underfilled.metadata.length,
      optimizedThirdBytes: optimized.metadata[2].outputBytes,
      underfilledThirdBytes: underfilled.metadata[2].outputBytes,
      maxPacketBytes: optimized.coverage.maxPacketBytes,
    }),
  );
});

test("реальный reader отклоняет oversized batch, смешанную schema и quoted selector без вывода sources", () => {
  for (const selections of [
    [
      ...BOOTSTRAP_READ_SELECTIONS,
      { path: "README.md", startLine: 1, endLine: 1 },
    ],
    [{ path: "README.md", startLine: 1 }],
    [{ path: "README.md", startLine: 1, endLine: null, section: "# heading" }],
    [
      {
        path: ".ai/workflows/delivery/git/commit-push/WORKFLOW.md",
        section: '"## Программный inspect"',
      },
    ],
  ]) {
    const result = invoke(selections);
    assert.equal(result.status, 2);
    assert.ok(result.stdout === "", "invalid reader input emitted source text");
    assert.ok(
      result.stderr === "read-context: INVALID_INPUT\n",
      "reader failure is not the fixed input code",
    );
  }
});
