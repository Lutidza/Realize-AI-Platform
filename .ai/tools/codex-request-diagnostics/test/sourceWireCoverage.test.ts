/**
 * @file .ai/tools/codex-request-diagnostics/test/sourceWireCoverage.test.ts
 * @version 1.0.1
 * @date 2026-11-25
 * @description Проверяет доставку Markdown через model-visible tool output, исключая metadata и reasoning.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  mergeSourceWireSnapshots,
  SourceWireCoverage,
} from "../src/sourceWireCoverage.service.ts";
import { RequestFingerprintObserver } from "../src/requestFingerprint.service.ts";
import {
  smokePhaseAccepted,
  smokeVisibleSources,
  smokeUpstreamConfirmed,
  summarizeSmokeWire,
} from "../src/runSmoke.controller.ts";
import type {
  SmokeObservation,
  SmokePhaseResult,
} from "../src/runSmoke.types.ts";
const skill = "PUBLIC_SKILL_FIXTURE";
const sources = [
  { path: "README.md", first: 1, last: 2, lines: ["alpha\n", "beta\n"] },
];
const packet = {
  sources: [
    { path: "README.md", startLine: 1, endLine: 2, text: "alpha\nbeta\n" },
  ],
  pending: [],
};

/** Synthetic report содержит canaries только в RAM; snapshots не должны сохранять их. */
function inspectReport(shape: "summary" | "full", reportedCount = 1) {
  const changes: Record<string, unknown> = { truncated: false };
  if (shape === "full")
    changes.items = Array.from({ length: reportedCount }, () => ({
      path: "CANARY_PRIVATE_PATH",
      status: "modified",
    }));
  else
    Object.assign(changes, {
      reportedCount,
      statusCounts: reportedCount ? { modified: reportedCount } : {},
      totalCount: reportedCount,
      pathsOmitted: true,
    });
  return {
    version: 1,
    command: { action: "inspect" },
    status: "succeeded",
    errorCode: null,
    result: {
      version: 1,
      action: "inspect",
      status: "succeeded",
      errorCode: null,
      commitCreated: false,
      pushStatus: "not_requested",
      fingerprint: "CANARY_PRIVATE_FINGERPRINT",
      changes,
    },
    ...(shape === "summary"
      ? { projection: { kind: "git-inspect-summary", version: 1 } }
      : {}),
  };
}

const hashA = "a".repeat(64),
  hashB = "b".repeat(64);
const toolBody = (output: unknown) =>
  Buffer.from(
    JSON.stringify({
      input: [{ type: "function_call_output", output }],
    }),
  );

test("payload metadata и reasoning не заменяют реально доставленные инструкции", () => {
  const observer = new SourceWireCoverage(sources, skill);
  observer.observe(
    Buffer.from(
      JSON.stringify({
        input: [{ type: "reasoning", summary: skill, packet }],
        client_metadata: { skill, packet },
        tools: [{ description: skill }],
      }),
    ),
  );
  assert.equal(observer.snapshot().readLines, 0);
  assert.equal(observer.snapshot().skillTextFragments, 0);
  observer.observe(
    Buffer.from(
      JSON.stringify({
        input: [
          {
            type: "message",
            role: "user",
            content: [{ type: "input_text", text: skill }],
          },
        ],
      }),
    ),
  );
  assert.equal(observer.snapshot().skillTextFragments, 1);
});

test("nested CodeMode stdout и полный повтор wire prefix дают один source proof", () => {
  const observer = new SourceWireCoverage(sources, skill);
  const body = Buffer.from(
    JSON.stringify({
      input: [
        {
          type: "function_call_output",
          output: JSON.stringify({
            output:
              "Chunk ID: fixture\nFinal output:\n" +
              JSON.stringify(packet) +
              "\n",
          }),
        },
      ],
    }),
  );
  observer.observe(body);
  observer.observe(body);
  assert.equal(observer.snapshot().readLines, 2);
  assert.equal(observer.snapshot().sourceProofs.length, 1);
  assert.equal(observer.snapshot().scanIncomplete, false);
  assert.ok(!JSON.stringify(observer.snapshot()).includes("alpha"));
});

test("WS wrapped delta поддержана; неверный текст не доказывает delivery", () => {
  const observer = new SourceWireCoverage(sources, skill);
  observer.observe(
    Buffer.from(
      JSON.stringify({
        type: "response.create",
        response: {
          previous_response_id: "fixture",
          input: [
            {
              type: "custom_tool_call_output",
              output: [{ type: "input_text", text: JSON.stringify(packet) }],
            },
          ],
        },
      }),
    ),
  );
  assert.equal(observer.snapshot().readLines, 2);
  const wrong = new SourceWireCoverage(sources, skill);
  wrong.observe(
    Buffer.from(
      JSON.stringify({
        input: [
          {
            type: "function_call_output",
            output: JSON.stringify({
              ...packet,
              sources: [{ ...packet.sources[0], text: "CANARY_WRONG" }],
            }),
          },
        ],
      }),
    ),
  );
  assert.equal(wrong.snapshot().readLines, 0);
  assert.ok(!JSON.stringify(wrong.snapshot()).includes("CANARY"));
});

function branchFixture(referenced: boolean): SmokeObservation[] {
  const fingerprint = new RequestFingerprintObserver(Buffer.alloc(32, 0xa4));
  const rows: SmokeObservation[] = [];
  const send = (value: unknown) => {
    const body = Buffer.from(JSON.stringify(value));
    const event = fingerprint.observeRequest(body, {
      transport: "websocket",
      connection: 1,
      headers: {},
    });
    if (event?.kind !== "request") assert.fail("expected request metadata");
    const scanner = new SourceWireCoverage(sources, skill);
    scanner.observe(body, event.inputItemHashes ?? undefined);
    const sourceWire = scanner.snapshot();
    rows.push({
      phase: "D0",
      event: event!,
      sourceWire,
      skillTextFragments: sourceWire.skillTextFragments,
      physicalConnection: 1,
    });
  };
  const reply = (type: string, id: string) => {
    const event = fingerprint.observeResponseEvent(
      {
        type,
        response: {
          id,
          usage: {
            input_tokens: 10,
            input_tokens_details: { cached_tokens: 8 },
            output_tokens: 1,
          },
        },
      },
      1,
    );
    assert.ok(event);
    rows.push({ phase: "D0", event, physicalConnection: 1 });
  };
  send({
    type: "response.create",
    model: "fixture",
    generate: false,
    input: [{ type: "function_call_output", output: JSON.stringify(packet) }],
  });
  reply("response.created", "prewarm");
  send({
    type: "response.create",
    model: "fixture",
    ...(referenced ? { previous_response_id: "prewarm" } : {}),
    input: [{ type: "message", role: "user", content: skill }],
  });
  reply("response.created", "first");
  reply("response.completed", "first");
  send({
    type: "response.create",
    model: "fixture",
    input: [
      {
        type: "function_call_output",
        output: JSON.stringify(inspectReport("summary", 0)),
      },
    ],
  });
  reply("response.created", "second");
  reply("response.completed", "second");
  fingerprint.dispose();
  return rows;
}

function accepted(
  rows: SmokeObservation[],
  adjust?: (result: SmokePhaseResult) => void,
): boolean {
  const usage = { inputTokens: 20, cachedInputTokens: 16, outputTokens: 2 };
  const result: SmokePhaseResult = {
    phase: "D0",
    expectedInspects: 1,
    threadHash: "thread",
    threadStarts: 1,
    completedTurns: 1,
    failedTurns: 0,
    nativeEventErrors: 0,
    sameInstructions: true,
    sameSettings: true,
    sameBuild: true,
    ephemeralRequested: true,
    upstreamTlsConfirmed: true,
    completed: true,
    usage,
    coverage: {
      commands: 2,
      runtimeChecks: 1,
      runtimeChecksPassed: 1,
      runtimeChecksCombined: 1,
      reads: 1,
      readLines: 2,
      duplicateLines: 0,
      invalidReads: 0,
      maxPacketBytes: 512,
      pendingCount: 0,
      sourceProofs: [],
      readerDiagnostics: [
        {
          call: 1,
          status: "completed",
          exitCode: 0,
          outputBytes: 512,
          errorCode: null,
          reasons: [],
        },
      ],
      readerDiagnosticsDropped: 0,
      inspectCount: 1,
      inspectCompactCount: 1,
      inspectDiagnosticsDropped: 0,
      inspectDiagnostics: [
        {
          call: 1,
          outputBytes:
            Buffer.byteLength(JSON.stringify(inspectReport("summary", 0))) + 1,
          reportBytes: Buffer.byteLength(
            JSON.stringify(inspectReport("summary", 0)),
          ),
          reportCount: 1,
          projectionKind: "git-inspect-summary",
          normalized: true,
          reportedCount: 0,
          statusGroups: 0,
          statusCountSum: 0,
          truncated: false,
          totalCount: 0,
          pathsOmitted: true,
        },
      ],
      inspectSuccessfulCount: 1,
      inspectFingerprintHashes: ["fingerprint"],
      inspectSucceeded: true,
      inspectFingerprintHash: "fingerprint",
      inspectReportedCount: 0,
      inspectTruncated: false,
      modelWorkerUsed: false,
    },
    visibleSources: smokeVisibleSources(rows),
    wire: summarizeSmokeWire({
      observations: rows,
      usage,
      absentModelHash: "absent",
    }),
    execution: {
      pid: 123,
      exitCode: 0,
      signal: null,
      exitObserved: true,
      timedOut: false,
      groupStopped: true,
      errorCode: null,
      eventCount: 5,
    },
    accepted: false,
  };
  adjust?.(result);
  return smokePhaseAccepted(result, 2, 1);
}

test("полное wire покрытие не заменяет обязательный combined runtime или ограничение command calls", () => {
  const rows = branchFixture(true);
  assert.equal(accepted(rows), true);
  for (const adjust of [
    (result: SmokePhaseResult) => {
      result.coverage.commands++;
    },
    (result: SmokePhaseResult) => {
      result.coverage.runtimeChecks = 0;
    },
    (result: SmokePhaseResult) => {
      result.coverage.runtimeChecks = 2;
    },
    (result: SmokePhaseResult) => {
      result.coverage.runtimeChecksPassed = 0;
    },
    (result: SmokePhaseResult) => {
      result.coverage.runtimeChecksCombined = 0;
    },
    (result: SmokePhaseResult) => {
      result.upstreamTlsConfirmed = false;
    },
  ])
    assert.equal(accepted(rows, adjust), false);
});

test("model request связан только с ранее установленным TLS того же physical CONNECT", () => {
  const requests = branchFixture(true).map((row): SmokeObservation =>
    row.event.kind === "request" ? { ...row, physicalConnection: 77 } : row,
  );
  const connected: SmokeObservation = {
    phase: "D0",
    event: {
      schemaVersion: 1,
      kind: "relay_upstream_attempt",
      connection: 77,
      attempt: 1,
      stage: "upstream_tls",
      outcome: "connected",
      errorClass: null,
      applicationForwarded: false,
    },
  };
  assert.equal(smokeUpstreamConfirmed([connected, ...requests]), true);
  assert.equal(smokeUpstreamConfirmed(requests), false);
  assert.equal(smokeUpstreamConfirmed([...requests, connected]), false);
  assert.equal(
    smokeUpstreamConfirmed([connected, connected, ...requests]),
    false,
  );
  const other = requests.map((row): SmokeObservation =>
    row.event.kind === "request" ? { ...row, physicalConnection: 78 } : row,
  );
  assert.equal(smokeUpstreamConfirmed([connected, ...other]), false);
  assert.equal(smokeUpstreamConfirmed([connected]), false);
});

test("orphan prewarm не закрывает delivery gate; referenced prewarm закрывает только с известным binding", () => {
  const orphan = branchFixture(false);
  assert.equal(smokeVisibleSources(orphan).readLines, 0);
  assert.equal(accepted(orphan), false);
  const referenced = branchFixture(true);
  assert.equal(smokeVisibleSources(referenced).readLines, 2);
  assert.equal(smokeVisibleSources(referenced).sourceProofs.length, 1);
  assert.equal(accepted(referenced), true);
  assert.equal(
    JSON.stringify(smokeVisibleSources(referenced)).includes("alpha"),
    false,
  );
  const unknown = referenced.map((row): SmokeObservation =>
    row.event.kind === "response_created" && row.event.generation === "prewarm"
      ? { ...row, event: { ...row.event, correlation: "unknown" } }
      : row,
  );
  assert.equal(smokeVisibleSources(unknown).readLines, 0);
  assert.equal(accepted(unknown), false);
});

test("nested CodeMode stdout доказывает summary без сохранения report полей", () => {
  const report = inspectReport("summary");
  const json = JSON.stringify(report);
  const observer = new SourceWireCoverage(sources, skill);
  observer.observe(
    toolBody(
      JSON.stringify({
        output: "Chunk ID: fixture\nFinal output:\n" + json + "\n",
      }),
    ),
    [hashA],
  );
  assert.deepEqual(observer.snapshot().inspectReports, [
    {
      itemHash: hashA,
      ordinal: 1,
      shape: "summary",
      jsonBytes: Buffer.byteLength(json),
      reportedCount: 1,
      truncated: false,
    },
  ]);
  assert.equal(observer.snapshot().scanIncomplete, false);
  assert.ok(!JSON.stringify(observer.snapshot()).includes("CANARY"));
});

test("message/metadata/reasoning и JSON examples в reader.sources не являются inspect outputs", () => {
  const json = JSON.stringify(inspectReport("summary"));
  const examplePacket = {
    sources: [{ ...packet.sources[0], text: json }],
    pending: [],
  };
  const observer = new SourceWireCoverage(sources, skill);
  observer.observe(
    Buffer.from(
      JSON.stringify({
        instructions: json,
        client_metadata: { output: json },
        input: [
          { type: "message", role: "user", content: json },
          { type: "reasoning", output: json },
          {
            type: "function_call_output",
            output: JSON.stringify({
              output: "Final output:\n" + JSON.stringify(examplePacket),
            }),
          },
          { type: "function_call_output", output: { metadata: json } },
        ],
      }),
    ),
    [hashA, hashA, hashA, hashA],
  );
  assert.equal(observer.snapshot().inspectReports.length, 0);
  assert.equal(observer.snapshot().scanIncomplete, false);
});

test("raw full отличается от summary; malformed projection и отсутствие HMAC fail closed", () => {
  const full = new SourceWireCoverage(sources, skill);
  full.observe(toolBody(JSON.stringify(inspectReport("full", 2))), [hashA]);
  assert.equal(full.snapshot().inspectReports[0].shape, "full");
  assert.equal(full.snapshot().inspectReports[0].reportedCount, 2);
  assert.equal(full.snapshot().scanIncomplete, false);
  assert.ok(!JSON.stringify(full.snapshot()).includes("CANARY"));
  for (const bad of [
    { ...inspectReport("summary"), projection: { kind: "wrong", version: 1 } },
    {
      ...inspectReport("summary"),
      result: {
        ...inspectReport("summary").result,
        changes: {
          truncated: false,
          reportedCount: 2,
          pathsOmitted: true,
          statusCounts: { modified: 1 },
          totalCount: 2,
        },
      },
    },
  ]) {
    const scanner = new SourceWireCoverage(sources, skill);
    scanner.observe(toolBody(JSON.stringify(bad)), [hashA]);
    assert.equal(scanner.snapshot().inspectReports.length, 0);
    assert.equal(scanner.snapshot().scanIncomplete, true);
  }
  for (const hashes of [undefined, ["CANARY_NOT_HMAC"]]) {
    const scanner = new SourceWireCoverage(sources, skill);
    scanner.observe(toolBody(JSON.stringify(inspectReport("summary"))), hashes);
    assert.equal(scanner.snapshot().inspectReports.length, 0);
    assert.equal(scanner.snapshot().scanIncomplete, true);
    assert.ok(!JSON.stringify(scanner.snapshot()).includes("CANARY"));
  }
});

test("per-item JSON dedup и полный prefix не схлопывают distinct tool call hashes", () => {
  const report = inspectReport("summary"),
    json = JSON.stringify(report);
  const output = JSON.stringify({ first: report, repeated: json });
  const first = new SourceWireCoverage(sources, skill);
  first.observe(toolBody(output), [hashA]);
  first.observe(toolBody(output), [hashA]);
  assert.equal(first.snapshot().inspectReports.length, 1);
  const prefix = new SourceWireCoverage(sources, skill);
  prefix.observe(
    Buffer.from(
      JSON.stringify({
        input: [
          { type: "function_call_output", output },
          {
            type: "custom_tool_call_output",
            output: [{ type: "output_text", text: json }],
          },
        ],
      }),
    ),
    [hashA, hashB],
  );
  const merged = mergeSourceWireSnapshots([
    first.snapshot(),
    prefix.snapshot(),
  ]);
  assert.equal(merged.inspectReports.length, 2);
  assert.deepEqual(
    merged.inspectReports.map((p) => p.itemHash),
    [hashA, hashB],
  );
  assert.equal(merged.scanIncomplete, false);
  const conflict = structuredClone(first.snapshot());
  conflict.inspectReports[0].reportedCount++;
  assert.equal(
    mergeSourceWireSnapshots([first.snapshot(), conflict]).scanIncomplete,
    true,
  );
});

test("inspect proof cap16 и merge overflow дают incomplete без raw fallback", () => {
  const json = JSON.stringify(inspectReport("summary"));
  const scanner = new SourceWireCoverage(sources, skill);
  scanner.observe(
    Buffer.from(
      JSON.stringify({
        input: Array.from({ length: 17 }, () => ({
          type: "function_call_output",
          output: json,
        })),
      }),
    ),
    Array.from({ length: 17 }, (_, i) => i.toString(16).padStart(64, "0")),
  );
  assert.equal(scanner.snapshot().inspectReports.length, 16);
  assert.equal(scanner.snapshot().scanIncomplete, true);
  const snapshots = Array.from({ length: 17 }, (_, i) => {
    const one = new SourceWireCoverage(sources, skill);
    one.observe(toolBody(json), [i.toString(16).padStart(64, "0")]);
    return one.snapshot();
  });
  const merged = mergeSourceWireSnapshots(snapshots);
  assert.equal(merged.inspectReports.length, 16);
  assert.equal(merged.scanIncomplete, true);
  assert.ok(!JSON.stringify(merged).includes("CANARY"));
});
