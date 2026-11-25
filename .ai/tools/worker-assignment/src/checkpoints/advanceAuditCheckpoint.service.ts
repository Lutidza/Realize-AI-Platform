/**
 * @file .ai/tools/worker-assignment/src/checkpoints/advanceAuditCheckpoint.service.ts
 * @version 1.1.0
 * @date 2026-11-25
 * @description Выполняет один допущенный обмен и атомарно подтверждает доставку чтения с очередным вызовом или отчётом.
 * @see documentation/specifications/task-management/execution/checkpoints-and-reads.md
 */
import { isDeepStrictEqual as equal } from "node:util";
import type { ReworkInboxRepository } from "@realize/payload-task-manager/audit-review";
import type { RepositoryReadPolicy } from "../../../../../services/ai-control-plane/src/RepositoryRead.types";
import { RepositoryReadError } from "../../../../../services/ai-control-plane/src/RepositoryRead.error";
import type {
  AuditCallKey,
  SingleReadTransport,
} from "../exchange/SingleRead.types";
import type {
  AuditCheckpointState,
  AuditTaskBinding,
} from "./AuditCheckpoint.types";
import type { CheckpointLease, CheckpointSnapshot } from "./Checkpoint.types";
import type { PostgresCheckpointStore } from "./PostgresCheckpoint.repository";
import { prepareCheckpointRequest } from "./prepareCheckpointRequest.service";
import { confirmAuditResponse } from "./confirmAuditResponse.service";

function common(state: AuditCheckpointState) {
  return {
    schemaVersion: state.schemaVersion,
    identity: state.identity,
    history: state.history,
  };
}

/** Вызов с оставшимся после перезапуска намерением выдаёт recovery_required без повторной отправки. */
export async function advanceAuditCheckpoint(
  store: PostgresCheckpointStore,
  snapshot: CheckpointSnapshot,
  lease: CheckpointLease,
  expectedTask: AuditTaskBinding,
  policy: RepositoryReadPolicy,
  transport: SingleReadTransport,
  expectedKey?: AuditCallKey,
  reworkSource?: ReworkInboxRepository,
) {
  const { state, attemptId } = snapshot;
  if (!equal(expectedTask, state.identity.task))
    throw new Error("task_binding_mismatch");
  const unknown = (requestId: string) => ({
    ...common(state),
    status: "delivery_unknown" as const,
    taskState: "recovery_required" as const,
    requestId,
  });
  if (state.status === "sending")
    return store.append(snapshot, lease, unknown(state.intent.requestId));
  if (state.status !== "ready" && state.status !== "pending") {
    const recorded = await store.get(attemptId);
    if (!equal(recorded, snapshot)) throw new Error("checkpoint_conflict");
    return recorded;
  }
  let prepared;
  try {
    prepared = await prepareCheckpointRequest(
      policy,
      attemptId,
      state,
      expectedKey,
      reworkSource,
    );
  } catch (error) {
    const reason =
      error instanceof RepositoryReadError
        ? error.code
        : error instanceof Error && /^[A-Za-z_]+$/.test(error.message)
          ? error.message
          : "access_unverified";
    return store.append(snapshot, lease, {
      ...common(state),
      status: "blocked",
      reason,
    });
  }
  const sending = await store.append(snapshot, lease, {
    ...common(state),
    status: "sending",
    intent: prepared.intent,
  });
  const { request } = prepared;
  let reply;
  try {
    reply = await transport.send({
      attemptId,
      requestId: request.id,
      body: request.body,
    });
  } catch {
    return store.append(sending, lease, unknown(request.id));
  }
  return confirmAuditResponse(store, sending, lease, reply);
}
