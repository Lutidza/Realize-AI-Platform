/**
 * @file .ai/tools/worker-assignment/src/checkpoints/confirmAuditResponse.service.ts
 * @version 1.0.0
 * @date 2026-11-25
 * @description Подтверждает доставку чтения и сохраняет следующий вызов либо отчёт в той же транзакции.
 * @see documentation/specifications/task-management/execution/checkpoints-and-reads.md
 */
import { createAuditCallKey } from "../exchange/performSingleRead.service";
import {
  callResponseSchema,
  reportResponseSchema,
} from "../exchange/singleReadMessages.schemas";
import type { SingleReadTransport } from "../exchange/SingleRead.types";
import type { AuditCheckpointState } from "./AuditCheckpoint.types";
import type { CheckpointLease, CheckpointSnapshot } from "./Checkpoint.types";
import type { PostgresCheckpointStore } from "./PostgresCheckpoint.repository";
import { hashAuditText } from "./hashAuditText.util";

/** Только подтверждённый ответ закрывает сохранённое намерение. БД фиксирует квитанцию вместе со следующим состоянием. */
export async function confirmAuditResponse(
  store: PostgresCheckpointStore,
  snapshot: CheckpointSnapshot,
  lease: CheckpointLease,
  reply: Awaited<ReturnType<SingleReadTransport["send"]>>,
) {
  const { state, attemptId } = snapshot;
  if (state.status !== "sending") throw new Error("intent_missing");
  const { requestId, read } = state.intent;
  const base = {
    schemaVersion: state.schemaVersion,
    identity: state.identity,
    history: state.history,
  };
  if (reply.attemptId !== attemptId || reply.requestId !== requestId)
    return store.append(snapshot, lease, {
      ...base,
      status: "blocked",
      reason: "request_mismatch",
    });
  const nextCall = callResponseSchema.safeParse(reply.body);
  const report = reportResponseSchema.safeParse(reply.body);

  const history = read
    ? [
        ...state.history,
        {
          ...read.entry,
          delivery: {
            requestId,
            operationSha256: hashAuditText(JSON.stringify(read.operation)),
          },
        },
      ]
    : state.history;
  let next: AuditCheckpointState;
  if (nextCall.success) {
    const assistant = nextCall.data.choices[0].message;
    const key = createAuditCallKey(attemptId, requestId, assistant);
    if (history.some((entry) => entry.key.toolCallId === key.toolCallId))
      return store.append(snapshot, lease, {
        ...base,
        status: "blocked",
        reason: "tool_call_mismatch",
      });
    next = { ...base, history, status: "pending", pending: { key, assistant } };
  } else if (report.success) {
    const text = report.data.choices[0].message.content;
    next = {
      ...base,
      history,
      status: "received",
      report: { text, sha256: hashAuditText(text) },
    };
  } else {
    return store.append(snapshot, lease, {
      ...base,
      status: "blocked",
      reason: "invalid_response",
    });
  }
  return store.append(
    snapshot,
    lease,
    next,
    read ? { requestId, operation: read.operation } : undefined,
  );
}
