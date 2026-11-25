/**
 * @file .ai/tools/worker-assignment/src/checkpoints/prepareCheckpointRequest.service.ts
 * @version 1.1.0
 * @date 2026-11-25
 * @description Заново связывает точные источники, историю и права попытки перед передачей имитатору.
 * @see documentation/specifications/task-management/execution/checkpoints-and-reads.md
 */
import { isDeepStrictEqual as equal } from "node:util";
import type { ReworkInboxRepository } from "@realize/payload-task-manager/audit-review";
import type { RepositoryReadPolicy } from "../../../../../services/ai-control-plane/src/RepositoryRead.types";
import { bindAssignment } from "../bindAssignment.service";
import { admitOpenAiAuditRequest } from "../adapters/openAiAuditRequest.adapter";
import { performSingleRead } from "../exchange/performSingleRead.service";
import type {
  AuditCallKey,
  AuditContinuation,
} from "../exchange/SingleRead.types";
import type { AuditCheckpointState } from "./AuditCheckpoint.types";

import { hashAuditText } from "./hashAuditText.util";

/** Старые квитанции не предоставляют права: каждую пару в окончательном запросе заново производит reader. */
export async function prepareCheckpointRequest(
  policy: RepositoryReadPolicy,
  attemptId: string,
  state: Extract<AuditCheckpointState, { status: "ready" | "pending" }>,
  expectedKey?: AuditCallKey,
  reworkSource?: ReworkInboxRepository,
) {
  const { identity, history } = state;
  const { selection, executor } = identity;
  if (
    expectedKey &&
    (state.status !== "pending" || !equal(state.pending.key, expectedKey))
  )
    throw new Error("tool_call_mismatch");
  const bound = await bindAssignment(
    policy,
    selection.lockPath,
    selection.contextId,
  );
  if (!bound.context)
    throw new Error(bound.report.issues[0]?.code ?? "context_unavailable");
  if (
    bound.report.lockSha256 !== identity.lockSha256 ||
    bound.report.revision !== identity.revision ||
    bound.report.assignmentId !== identity.assignmentId ||
    hashAuditText(bound.context.initialInput) !== identity.inputSha256
  )
    throw new Error("context_mismatch");
  let initialInput = bound.context.initialInput;
  if (identity.rework) {
    if (!reworkSource) throw new Error("rework_authority_missing");
    const { actorId, workId, inputSha256 } = identity.rework;
    const rework = await reworkSource.readAuditInput(
      actorId,
      workId,
      attemptId,
    );
    if (
      !equal(bound.context.readPins, rework.sourcePins) ||
      hashAuditText(JSON.stringify(rework)) !== inputSha256
    )
      throw new Error("rework_input_mismatch");
    initialInput = JSON.stringify({ ...JSON.parse(initialInput), rework });
  }
  const entries =
    state.status === "pending" ? [...history, state.pending] : history;
  const pairs: AuditContinuation[] = [];
  let read: Extract<
    AuditCheckpointState,
    { status: "sending" }
  >["intent"]["read"] = null;
  for (const [index, entry] of entries.entries()) {
    const { operation, continuation } = await performSingleRead(
      bound,
      attemptId,
      entry.key.requestId,
      entry.assistant,
    );
    const resultSha256 = hashAuditText(continuation.result.content);
    if (
      !equal(operation.key, entry.key) ||
      (index < history.length && history[index].resultSha256 !== resultSha256)
    )
      throw new Error("tool_call_mismatch");
    pairs.push(continuation);
    if (index === history.length)
      read = { entry: { ...entry, resultSha256 }, operation };
  }
  const admitted = await admitOpenAiAuditRequest(
    { ...bound, context: { ...bound.context, initialInput } },
    { attemptId, bindingKind: "request", target: executor },
    selection.lockPath,
    pairs,
  );
  if (!admitted.request)
    throw new Error(admitted.report.issues[0]?.code ?? "access_unverified");
  if (admitted.report.providerPolicy?.revision !== identity.policyRevision)
    throw new Error("policy_changed");
  return {
    request: admitted.request,
    intent: {
      requestId: admitted.request.id,
      bodySha256: hashAuditText(admitted.request.body),
      read,
    },
  };
}
