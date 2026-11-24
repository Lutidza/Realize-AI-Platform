/**
 * @file .ai/tools/git-delivery/test/renderGitInspectSummary.controller.test.ts
 * @version 1.0.0
 * @date 2026-11-19
 * @description Проверяет сохранение inspect metadata, ошибок и байтов stdin при компактной проекции.
 * Контракт представления: .ai/tools/git-delivery/README.md#компактная-сводка-inspect.
 */
import assert from "node:assert/strict";
import { PassThrough, Readable, Writable } from "node:stream";
import { setImmediate } from "node:timers/promises";
import { test } from "node:test";
import { renderGitInspectSummary } from "../src/worker/renderGitInspectSummary.controller.ts";

function success() {
  return {
    version: 1,
    status: "succeeded",
    errorCode: null,
    command: { action: "inspect" },
    result: {
      version: 1,
      requestId: "fixture-inspect",
      action: "inspect",
      status: "succeeded",
      branch: "main" as string | null,
      commit: "a".repeat(40) as string | null,
      commitCreated: false,
      pushStatus: "not_requested",
      changes: {
        items: [
          { path: "компонент.tsx", status: " M" },
          { path: "other.ts", status: " M" },
          { path: "new.ts", status: "??" },
        ],
        truncated: false,
      },
      fingerprint: "b".repeat(64),
      checks: [],
      errorCode: null,
      summary: "Состояние прочитано без изменения индекса и файлов.",
      retryable: false,
      futureResult: { preserved: true },
    },
    worker: {
      model: null,
      threadId: null,
      turnId: null,
      durationMs: 12,
      handlerCalls: 1,
      instructionBytes: 0,
      usage: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 },
    },
    futureReport: { preserved: true },
  };
}

function sink() {
  const chunks: Buffer[] = [];
  const output = new Writable({
    write(chunk, _encoding, done) {
      chunks.push(Buffer.from(chunk));
      done();
    },
  });
  return { output, bytes: () => Buffer.concat(chunks) };
}

async function render(raw: Buffer, limit?: number, split = raw.length) {
  const capture = sink();
  await renderGitInspectSummary(
    Readable.from([raw.subarray(0, split), raw.subarray(split)]),
    capture.output,
    limit,
  );
  return capture.bytes();
}

test("success сохраняет весь report/result metadata и считает только выданные changes", async () => {
  for (const truncated of [false, true]) {
    const report = success();
    report.result.changes.truncated = truncated;
    const raw = Buffer.from(JSON.stringify(report));
    const projected = JSON.parse((await render(raw)).toString());
    const expectedChanges = {
      truncated,
      reportedCount: 3,
      statusCounts: { " M": 2, "??": 1 },
      totalCount: truncated ? null : 3,
      pathsOmitted: true,
    };
    assert.deepEqual(projected, {
      ...report,
      result: { ...report.result, changes: expectedChanges },
      projection: { kind: "git-inspect-summary", version: 1 },
    });
    assert.equal(report.result.changes.items.length, 3);
    assert.equal(JSON.stringify(projected).includes("компонент.tsx"), false);
  }
});

test("пустой, detached и unborn inspect остаются корректными success", async () => {
  for (const mode of [
    "empty",
    "detached",
    "unborn",
    "nullable",
    "noop",
  ] as const) {
    const report = success();
    if (mode === "empty") report.result.changes.items = [];
    if (mode === "detached") report.result.branch = null;
    if (mode === "unborn") report.result.commit = null;
    if (mode === "nullable") {
      report.result.branch = null;
      report.result.commit = null;
      Reflect.set(report.result, "fingerprint", null);
      Reflect.set(report.result, "requestId", null);
    }
    if (mode === "noop") report.result.status = "noop";
    const projected = JSON.parse(
      (await render(Buffer.from(JSON.stringify(report)))).toString(),
    );
    assert.equal(projected.projection.kind, "git-inspect-summary");
    assert.equal(projected.result.commit, report.result.commit);
    assert.equal(projected.result.branch, report.result.branch);
    assert.equal(
      projected.result.changes.reportedCount,
      report.result.changes.items.length,
    );
  }
});

test("ошибки и противоречивые envelopes проходят без потери исходного JSON", async () => {
  const cases: [string, string[], unknown][] = [
    ["blocked", ["status"], "blocked"],
    ["failed", ["status"], "failed"],
    ["partial", ["result", "status"], "partial"],
    ["result error", ["result", "errorCode"], "fixture_failure"],
    ["report error", ["errorCode"], "fixture_failure"],
    ["other command", ["command", "action"], "commit"],
    ["other result", ["result", "action"], "commit"],
    ["model", ["worker", "model"], "fixture-model"],
    ["missing fingerprint", ["result", "fingerprint"], undefined],
    ["unknown version", ["version"], 2],
    ["bad status", ["result", "changes", "items", "0", "status"], 123],
    ["unknown item field", ["result", "changes", "items", "0", "extra"], true],
    ["projection collision", ["projection"], { preserved: true }],
    ["counts collision", ["result", "changes", "reportedCount"], 99],
  ];
  for (const [name, path, value] of cases) {
    const report = success();
    let owner: object = report;
    for (const key of path.slice(0, -1)) owner = Reflect.get(owner, key);
    Reflect.set(owner, path.at(-1)!, value);
    const raw = Buffer.from(
      " \r\n" + JSON.stringify(report, null, 2) + "\r\n ",
    );
    assert.deepEqual(await render(raw), raw, name);
  }
});

test("точные status strings и metadata changes сохраняются без prototype collisions", async () => {
  const report = success();
  report.result.changes.items = [
    "__proto__",
    "constructor",
    "",
    "__proto__",
  ].map((status, index) => ({ path: `${index}.ts`, status }));
  Reflect.set(report.result.changes, "futureChanges", { preserved: true });
  const projected = JSON.parse(
    (await render(Buffer.from(JSON.stringify(report)))).toString(),
  );
  assert.equal(
    Object.hasOwn(projected.result.changes.statusCounts, "__proto__"),
    true,
  );
  assert.equal(projected.result.changes.statusCounts.__proto__, 2);
  assert.equal(projected.result.changes.statusCounts.constructor, 1);
  assert.equal(projected.result.changes.statusCounts[""], 1);
  assert.deepEqual(projected.result.changes.futureChanges, { preserved: true });
});

test("config errors, unknown JSON, raw и некорректный UTF-8 остаются побайтно исходными", async () => {
  const cases = [
    Buffer.from(
      '{"version":1,"status":"blocked","errorCode":"worker_configuration_invalid","result":null}\n',
    ),
    Buffer.from('{"unknown":"ошибка"}\r\n'),
    Buffer.from("null\n"),
    Buffer.from("[]\n"),
    Buffer.from("not JSON\r\n"),
    Buffer.from('{"broken":'),
    Buffer.alloc(0),
    Buffer.from([0x7b, 0xff, 0x7d, 0x0a]),
    Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]),
      Buffer.from(JSON.stringify(success())),
    ]),
  ];
  for (const raw of cases) assert.deepEqual(await render(raw), raw);
});

test("UTF-8 на границе chunks и точный лимит stdin не повреждают success", async () => {
  const raw = Buffer.from(JSON.stringify(success()));
  const split = raw.indexOf(Buffer.from("компонент")) + 1;
  assert.ok(
    JSON.parse((await render(raw, raw.length, split)).toString()).projection,
  );
  assert.deepEqual(await render(raw, raw.length - 1, split), raw);
});

test("overflow переключается на passthrough до EOF и сохраняет каждый байт", async () => {
  const input = new PassThrough();
  const capture = sink();
  const pending = renderGitInspectSummary(input, capture.output, 64);
  const prefix = Buffer.alloc(40, 0x61);
  const next = Buffer.alloc(40, 0x62);
  const tail = Buffer.from([0xff, 0x00, 0x0a]);
  input.write(prefix);
  input.write(next);
  await setImmediate();
  assert.deepEqual(capture.bytes(), Buffer.concat([prefix, next]));
  input.end(tail);
  await pending;
  assert.deepEqual(capture.bytes(), Buffer.concat([prefix, next, tail]));
});

test("input/output ошибки остаются ошибками, а полученный input не теряется", async () => {
  const input = new PassThrough();
  const capture = sink();
  const prefix = Buffer.from("partial input\r\n");
  const pending = renderGitInspectSummary(input, capture.output);
  input.write(prefix);
  await setImmediate();
  const failed = assert.rejects(pending, /input fixture/u);
  input.destroy(new Error("input fixture"));
  await failed;
  assert.deepEqual(capture.bytes(), prefix);
  await assert.rejects(
    renderGitInspectSummary(
      Readable.from(["raw"]),
      new Writable({
        write(_chunk, _encoding, done) {
          done(new Error("output fixture"));
        },
      }),
    ),
    /output fixture/u,
  );
});
