/**
 * @file packages/engineering-runtime/src/runtime/EngineeringRecovery.service.ts
 * @version 1.1.0
 * @date 2026-10-26
 * @description Строит read-only recovery proposal и продолжает только доказанный frozen cursor.
 * @see documentation/architecture/engineering-operations.md
 */
import { engineeringIdentity } from "./engineeringIdentity.util.ts";
import type {
  CancelCommand,
  RecoverCommand,
} from "../contracts/EngineeringCommand.types.ts";
import { hashEngineeringValue } from "../contracts/hashEngineeringValue.util.ts";
import type { EngineeringContext } from "./EngineeringContext.service.ts";
import type { RuntimeRecord } from "./EngineeringRuntime.types.ts";
import type { RecoveryView } from "./EngineeringResult.types.ts";
import { failure } from "./EngineeringFailure.error.ts";
import { executeFrozenSteps } from "./EngineeringExecution.service.ts";
import { mapOperation } from "./EngineeringOperation.mapper.ts";

/** Вызывается под lease; вычисление proposal ничего не записывает. */
export function inspectLockedRecovery(
  ctx: EngineeringContext,
  record: RuntimeRecord,
): RecoveryView {
  const d = record.payload;
  if (!d.plan)
    return failure(
      "UNSUPPORTED",
      "Восстановление подготовки без frozen plan не поддержано.",
    );
  const observedManifestHash = ctx.snapshot(record);
  const writerStopped =
    d.writeBlock !== "writer_unconfirmed" &&
    (d.executionMode === "none" ||
      (d.executionMode === "in_process_sync" &&
        ctx.options.effects?.mode === "in_process_sync"));
  const matches =
    observedManifestHash === d.plan.prepared.snapshots[d.cursor] ||
    (d.pending === d.cursor &&
      observedManifestHash === d.plan.prepared.snapshots[d.cursor + 1]);
  const canResume =
    writerStopped &&
    matches &&
    d.writeBlock === "fs_unresolved" &&
    d.attempt < 64;
  const snapshot = {
    operationId: record.operationId,
    revision: record.revision,
    planHash: d.plan.public.planHash,
    observedManifestHash,
    cursor: d.cursor,
    pending: d.pending,
    writerStopped,
    actions: canResume ? ["resume" as const] : [],
  };
  const hash = hashEngineeringValue(snapshot);
  // UUID v8 выводится из значимых полей, не из времени чтения.
  const recoveryPlanId = engineeringIdentity(hash);
  return {
    schemaVersion: 1,
    ...snapshot,
    recoveryPlanId,
    recoveryPlanHash: hash,
  };
}

export async function recoverOperation(
  ctx: EngineeringContext,
  command: RecoverCommand,
) {
  let record = ctx.load(command.operationId);
  await ctx.authorize("recover", record);
  const request = ctx.request("recover", command);
  const replay = ctx.replay(request);
  if (replay) return mapOperation(replay);
  return ctx.store.withWorkspaceLease(async (lease) => {
    record = ctx.load(command.operationId);
    await ctx.authorize("recover", record);
    const replayAfterLock = ctx.replay(request);
    if (replayAfterLock) return mapOperation(replayAfterLock);
    ctx.compareRevision(record, command.expectedRevision);
    ctx.assertUnblocked(record.operationId);
    lease.assertHeld();
    const proposal = inspectLockedRecovery(ctx, record);
    if (
      proposal.recoveryPlanHash !== command.recoveryPlanHash ||
      proposal.recoveryPlanId !== command.recoveryPlanId
    )
      return failure("CONFLICT", "Recovery snapshot изменился.");
    if (command.action !== "resume")
      return failure(
        "UNSUPPORTED",
        "Компенсация и retain_partial требуют отдельных adapters.",
      );
    if (!proposal.actions.includes("resume"))
      return failure(
        "RECOVERY_REQUIRED",
        "Нельзя доказать безопасное продолжение.",
      );
    const d = record.payload;
    if (
      d.pending === d.cursor &&
      proposal.observedManifestHash === d.plan!.prepared.snapshots[d.cursor + 1]
    ) {
      // Видимый after не доказывает завершённый fsync после crash между rename и journal.
      const returned: unknown = ctx.options.effects?.confirmDurable?.(
        structuredClone(d.plan!),
        d.cursor,
      );
      if (returned !== undefined) {
        d.executionMode = "unconfirmed";
        d.writeBlock = "writer_unconfirmed";
        d.cancelState = "stop_unconfirmed";
        ctx.persist(record, "durability_unconfirmed");
        return failure(
          "UNSUPPORTED",
          "Durability port нарушил синхронный контракт.",
        );
      }
      lease.assertHeld();
      if (ctx.snapshot(record) !== d.plan!.prepared.snapshots[d.cursor + 1])
        return failure(
          "CONFLICT",
          "Manifest изменился при подтверждении durability.",
        );
      d.cursor++;
    }
    // after уже достигнут: primitive не повторяется. before — допускается ровно прежний шаг.
    d.pending = null;
    d.effects =
      d.cursor === 0
        ? "none"
        : d.cursor === d.plan!.prepared.effects.length
          ? "applied"
          : "partial";
    d.attempt++;
    d.state = "applying";
    d.cancelState = "none";
    d.error = null;
    d.activeRequestHash = request.hash;
    record = ctx.persist(record, "recovery_admitted", request);
    return executeFrozenSteps(ctx, record, lease);
  });
}

export async function cancelOperation(
  ctx: EngineeringContext,
  command: CancelCommand,
) {
  let record = ctx.load(command.operationId);
  await ctx.authorize("cancel", record);
  const request = ctx.request("cancel", command);
  const replay = ctx.replay(request);
  if (replay) return mapOperation(replay);
  record = ctx.load(command.operationId);
  ctx.compareRevision(record, command.expectedRevision);
  if (
    ![
      "planned",
      "planning",
      "applying",
      "cancelling",
      "recovery_required",
    ].includes(record.payload.state)
  )
    return failure("CONFLICT", "Операция уже завершена.");
  const active = record.payload.writeBlock !== null;
  record.payload.cancelState =
    record.payload.writeBlock === "writer_unconfirmed"
      ? "stop_unconfirmed"
      : active
        ? "requested"
        : "confirmed";
  record.payload.state = active ? "cancelling" : "cancelled";
  return mapOperation(
    ctx.persist(
      record,
      active ? "cancel_requested" : "cancel_confirmed",
      request,
    ),
  );
}
