/**
 * @file .ai/tools/worker-assignment/test/conclusion/auditReport.fixture.ts
 * @version 2.0.2
 * @date 2026-11-26
 * @description Формирует отчёт имитатора из результатов чтений временного назначения и поддерживает его доработку.
 * @see documentation/specifications/task-management/execution/checkpoints-and-reads.md
 */
import assert from "node:assert/strict";
import type { ReworkInboxRepository } from "@realize/payload-task-manager/audit-review";
import type { AssignmentReadReceipt } from "../../src/AssignmentTransport.types";
import { advanceAuditCheckpoint } from "../../src/checkpoints/advanceAuditCheckpoint.service";
import type { SingleReadTransport } from "../../src/exchange/SingleRead.types";
import type { setupCheckpointStorage } from "../checkpoints/checkpointStorage.fixture";
import { checkpointSimulatorResponse } from "../checkpoints/checkpointSimulatorResponse.fixture";
import type { CheckpointSimulatorScript } from "../checkpoints/CheckpointScenario.types";

export function auditQuotes(disputed: boolean) {
  return {
    responsibilities: "В отчёте перечислены источники фактических чтений.",
    "create-chain":
      "Каждая запись о прочитанных строках получена из ответа repo_read_file.",
    "verification-chain": disputed
      ? "Совпадения пути достаточно для подтверждения версии файла."
      : "Версия прочитанного файла определяется путём и SHA-256.",
    "findings-and-limits": "Выводы ограничены полученными диапазонами строк.",
  };
}

export function describeAuditRead({
  path,
  sha256,
  startLine,
  endLine,
}: AssignmentReadReceipt) {
  const range = endLine === 0 ? "пустой файл" : `L${startLine}–${endLine}`;
  return `${path} ${range} SHA-256 ${sha256}`;
}

/** Отказ и чтение пустого файла не создают фиктивных диапазонов в отчёте. */
export function auditReportResponse(
  body: string,
  simulator: CheckpointSimulatorScript,
  disputed: boolean,
  extraReportLine?: string,
) {
  return checkpointSimulatorResponse(body, simulator, (results) => {
    assert.equal(results.length, simulator.reads.length);
    const lines = results.map((result, index) => {
      const read = simulator.reads[index];
      assert.equal(result.tool_call_id, read.callId);
      const receipt = JSON.parse(result.content);
      if (receipt.code === "FORBIDDEN")
        return `${read.path} — чтение отклонено`;
      assert.equal(receipt.path, read.path);
      assert.equal(receipt.startLine, read.startLine);
      assert.match(receipt.sha256, /^[a-f0-9]{64}$/);
      return describeAuditRead(receipt);
    });
    return [
      ...lines,
      ...Object.values(auditQuotes(disputed)),
      ...(extraReportLine ? [extraReportLine] : []),
    ].join("\n");
  });
}

/** Через штатный checkpoint фиксирует именно те строки, на которые опираются выводы имитатора. */
export async function runAuditReport(
  f: Pick<
    Awaited<ReturnType<typeof setupCheckpointStorage>>,
    "store" | "task" | "policy" | "initial" | "simulator"
  > & { attemptId: string },
  disputed: boolean,
  inbox?: ReworkInboxRepository,
  extraReportLine?: string,
) {
  const transport: SingleReadTransport = {
    async send(request) {
      if (f.initial.state.identity.rework) {
        const user = JSON.parse(
          JSON.parse(request.body).messages[0].content,
        ).rework;
        assert.equal(user.work.workId, f.initial.state.identity.rework.workId);
        assert.equal(user.work.action, "return_audit");
        assert(
          user.work.points.length &&
            user.previousReport &&
            user.previousConclusionSha256,
        );
      }
      return {
        attemptId: request.attemptId,
        requestId: request.requestId,
        body: auditReportResponse(
          request.body,
          f.simulator,
          disputed,
          extraReportLine,
        ),
      };
    },
  };
  let snapshot = f.initial;
  const lease = await f.store.claim(
    f.attemptId,
    snapshot.revision,
    "audit-report-simulator",
    90000,
  );
  try {
    for (let index = 0; index <= f.simulator.reads.length; index++) {
      snapshot = await advanceAuditCheckpoint(
        f.store,
        snapshot,
        lease,
        f.task,
        f.policy,
        transport,
        undefined,
        inbox,
      );
    }
    assert.equal(
      snapshot.state.status,
      "received",
      JSON.stringify(
        snapshot.state.status === "blocked" && snapshot.state.reason,
      ),
    );
  } finally {
    await f.store.release(lease);
  }
}
