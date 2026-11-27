/**
 * @file .ai/tools/worker-assignment/test/auditRanges.test.ts
 * @version 1.0.0
 * @date 2026-11-26
 * @description Проверяет границы и целостность доставленных диапазонов, включая повторную выдачу.
 * @see documentation/specifications/internal-mcp.md
 */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { IdeAssignmentQueue } from "realize-ai-platform/ide-assignment-queue";
import { hashAuditText } from "../src/checkpoints/hashAuditText.util";
import {
  planAuditRanges,
  verifyAuditDeliveries,
} from "../src/auditRanges.service";

import type { AssignmentBindResult } from "../src/WorkerAssignment.types";
import { prepareIdeAuditInput } from "../src/prepareIdeAuditInput.service";

const source = "я\r\nB\n尾";
const ranges = planAuditRanges("file.txt", source, hashAuditText(source), 4);
const plan = ranges.map((range, i) => ({
  assignmentId: String(i),
  ranges: [range],
}));

test("сверяет точные UTF-8 диапазоны в любом порядке и EOF пустого файла", () => {
  assert.deepEqual(
    ranges.map((r) => r.rangeSha256),
    ["я\r\n", "B\n", "尾"].map(hashAuditText),
  );
  assert.deepEqual(verifyAuditDeliveries(plan, plan.toReversed()), {
    verifiedRanges: 3,
    completeFiles: 1,
    errors: [],
  });
  const empty = [
    {
      assignmentId: "e",
      ranges: planAuditRanges("empty", "", hashAuditText(""), 4),
    },
  ];
  assert.equal(empty[0].ranges[0].endLine, 0);
  assert.deepEqual(verifyAuditDeliveries(empty, empty).errors, []);
});

test("выявляет пропущенную, повторную, пересекающуюся и подменённую часть", () => {
  for (const partial of [
    plan.slice(1),
    plan.slice(0, -1),
    [plan[0], plan[2]],
    [...plan, plan[0]],
  ])
    assert.ok(verifyAuditDeliveries(plan, partial).errors.length);
  for (const mismatch of [
    { rangeSha256: hashAuditText("X\n") },
    { fileSha256: hashAuditText("") },
    { byteLength: 0 },
  ]) {
    const changed = structuredClone(plan);
    Object.assign(changed[1].ranges[0], mismatch);
    assert.ok(verifyAuditDeliveries(plan, changed).errors.length);
  }
  for (const startLine of [1, 3]) {
    const malformedPlan = structuredClone(plan);
    malformedPlan[1].ranges[0].startLine = startLine;
    assert.ok(
      verifyAuditDeliveries(malformedPlan, malformedPlan).errors.length,
    );
  }
  assert.ok(
    verifyAuditDeliveries(plan, [
      { ...plan[0], assignmentId: "wrong" },
      ...plan.slice(1),
    ]).errors.length,
  );
});

test("квитанции сохраняются после повторного открытия и изолированы по попытке", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "ide-queue-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const first = new IdeAssignmentQueue(dir, process.cwd());
  first.submit("tester", { task: "review", idempotencyKey: "request" });
  const job = first.claim()!;
  first.recordDelivery(job.runId, job.token, plan[0]);
  first.recordSearchStep(job.runId, job.token, 1, {
    phase: "source-review",
    status: "completed",
    assignmentId: plan[0].assignmentId,
    report: "факты по диапазону",
  });
  first.recordSearchStep(job.runId, job.token, 2, {
    phase: "assessment",
    areas: [{ path: "engine/a.ts" }],
    objectives: [],
    consumers: [{ source: "engine/a.ts" }, { source: "client/use.ts" }],
    report: "старый вывод",
  });
  assert.deepEqual(first.priorSearchPaths(job.runId, job.token), []);
  first.recordDelivery(job.runId, job.token, plan[0]);
  assert.throws(() =>
    first.recordDelivery(job.runId, job.token, { ...plan[0], ranges: [] }),
  );
  first.close();
  const reopened = new IdeAssignmentQueue(dir, process.cwd());
  t.after(() => reopened.close());
  assert.deepEqual(reopened.readDeliveries(job.runId, job.token), [plan[0]]);
  const db = new DatabaseSync(join(dir, "assignments.sqlite"));
  db.prepare("UPDATE runs SET expires=0 WHERE runId=?").run(job.runId);
  db.close();
  const next = reopened.claim()!;
  assert.equal(next.runId, job.runId);
  assert.deepEqual(reopened.readDeliveries(next.runId, next.token), []);
  assert.deepEqual(
    reopened.priorAuditMaterial(next.runId, next.token)?.deliveries,
    [plan[0]],
  );
  assert.equal(reopened.priorAuditMaterial(next.runId, job.token), undefined);
  assert.deepEqual(reopened.priorSearchPaths(next.runId, next.token), [
    "engine/a.ts",
    "client/use.ts",
  ]);
  assert.deepEqual(reopened.priorSearchPaths(next.runId, job.token), []);
  assert.throws(() => reopened.recordDelivery(job.runId, job.token, plan[1]));
});

test("квитанция относится к тексту в reviewFiles; ранний EOF и разрыв страниц запрещают выдачу", async () => {
  const path = "sample.txt";
  const lines = ["заголовок\r\n", "β\r\n", "末"];
  const fileSha256 = hashAuditText(lines.join(""));
  const context: NonNullable<AssignmentBindResult["context"]> = {
    contextId: "test",
    initialInput: "{}",
    scopePins: { [path]: fileSha256 },
    readPins: { [path]: fileSha256 },
    async callTool(_name, args) {
      const { startLine } = args as { startLine: number };
      const nextLine = startLine < lines.length ? startLine + 1 : null;
      return {
        path,
        text: lines[startLine - 1],
        startLine,
        endLine: startLine,
        totalLines: lines.length,
        nextLine,
        truncated: nextLine !== null,
        truncationReason: nextLine ? "page_limit" : null,
        version: {
          source: "working_tree",
          sha256: fileSha256,
          byteLength: Buffer.byteLength(lines.join("")),
        },
      };
    },
  };
  const { input, receipts } = await prepareIdeAuditInput(context, {
    [path]: [2, 3],
  });
  const reviewed = JSON.parse(input).reviewFiles[0];
  assert.equal(reviewed.text, lines.slice(1).join(""));
  assert.deepEqual(receipts, [
    {
      path,
      fileSha256,
      startLine: 2,
      endLine: 3,
      totalLines: 3,
      byteLength: Buffer.byteLength(reviewed.text),
      rangeSha256: hashAuditText(reviewed.text),
    },
  ]);
  for (const invalid of [
    { nextLine: null },
    { startLine: 3 },
    { text: "" },
    { totalLines: 2 },
  ]) {
    await assert.rejects(
      prepareIdeAuditInput(
        {
          ...context,
          async callTool(...args) {
            return { ...(await context.callTool(...args)), ...invalid };
          },
        },
        { [path]: [2, 3] },
      ),
      /assignment_read/,
    );
  }
});
