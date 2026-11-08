/**
 * @file packages/engineering-runtime/src/runtime/EngineeringExecution.service.ts
 * @version 1.4.0
 * @date 2026-10-28
 * @description Выполняет frozen шаги с durable pending, сверкой manifest и запретом повторных эффектов.
 * @see documentation/architecture/engineering-operations.md
 */
import { randomUUID } from "node:crypto";
import type { ApplyCommand } from "../contracts/EngineeringCommand.types.ts";
import type { WorkspaceLease } from "../storage/engineeringStorage.index.ts";
import type { RuntimeRecord } from "./EngineeringRuntime.types.ts";
import type { EngineeringContext } from "./EngineeringContext.service.ts";
import { failure } from "./EngineeringFailure.error.ts";
import { mapOperation } from "./EngineeringOperation.mapper.ts";
import { mapChangedArtifacts } from "./mapChangedArtifacts.mapper.ts";

function requireEffects(ctx: EngineeringContext, record: RuntimeRecord) {
  if (
    record.payload.plan?.prepared.effects.length &&
    ctx.options.effects?.mode !== "in_process_sync"
  )
    failure(
      "UNSUPPORTED",
      "Проверенный синхронный адаптер файловых эффектов не подключён.",
    );
}

/** Требуется живой workspace lease. Внешние processes этим контуром не запускаются. */
export async function executeFrozenSteps(
  ctx: EngineeringContext,
  initial: RuntimeRecord,
  lease: WorkspaceLease,
) {
  let record = initial;
  const deadline = ctx.now() + 10 * 60_000;
  try {
    await ctx.authorizeEffects(record, record.payload.cursor);
    while (
      record.payload.cursor < record.payload.plan!.prepared.effects.length
    ) {
      const index = record.payload.cursor;
      await ctx.authorize("effect", record, null, index);
      lease.assertHeld();
      record = ctx.load(record.operationId);
      if (record.payload.cancelState === "requested") {
        record.payload.cancelState = "confirmed";
        record.payload.state = index === 0 ? "cancelled" : "recovery_required";
        record.payload.writeBlock = index === 0 ? null : "fs_unresolved";
        return mapOperation(ctx.persist(record, "cancel_confirmed"));
      }
      if (ctx.now() > deadline)
        failure("LIMIT_EXCEEDED", "Превышен срок исполнения.", "apply");
      if (
        ctx.snapshot(record) !== record.payload.plan!.prepared.snapshots[index]
      )
        failure("CONFLICT", "Manifest изменился перед эффектом.", "apply");
      record.payload.pending = index;
      record = ctx.persist(record, "effect_pending");
      lease.assertHeld();
      // Port получает копию: изменение adapter object не меняет durable frozen plan.
      const returned: unknown = ctx.options.effects!.apply(
        structuredClone(record.payload.plan!),
        index,
      );
      if (returned !== undefined) {
        record.payload.writeBlock = "writer_unconfirmed";
        record.payload.executionMode = "unconfirmed";
        record.payload.cancelState = "stop_unconfirmed";
        failure(
          "UNSUPPORTED",
          "Adapter нарушил синхронную границу writer.",
          "apply",
        );
      }
      lease.assertHeld();
      if (
        ctx.snapshot(record) !==
        record.payload.plan!.prepared.snapshots[index + 1]
      )
        failure(
          "RECOVERY_REQUIRED",
          "Результат эффекта не подтверждён.",
          "apply",
        );
      record.payload.cursor++;
      record.payload.pending = null;
      record.payload.effects =
        record.payload.cursor === record.payload.plan!.prepared.effects.length
          ? "applied"
          : "partial";
      record = ctx.persist(record, "effect_confirmed");
    }
    lease.assertHeld();
    const actual = ctx.snapshot(record);
    if (
      actual !== record.payload.plan!.prepared.snapshots[record.payload.cursor]
    )
      failure("CONFLICT", "Итоговый manifest изменился.", "apply");
    const plan = record.payload.plan!.public;
    record.payload.receipts.push({
      schemaVersion: 1,
      id: randomUUID(),
      previousReceiptRef: record.payload.receipts.at(-1)?.id ?? null,
      operationId: record.operationId,
      revision: record.revision + 1,
      origin: "typed",
      planHash: plan.planHash,
      requestHash: record.payload.activeRequestHash,
      actor: {
        kind: ctx.options.principal.actorKind,
        id: ctx.options.principal.actorId,
      },
      targetRef: plan.targetRef,
      effectsSummary: record.payload.effects,
      beforeManifestHash: plan.sourceManifestHash,
      afterManifestHash: actual,
      checksSummary: "not_run",
      checkReceiptRefs: [],
      taskRefs: plan.taskRefs,
      gitRefs: [],
      createdArtifacts: plan.effects.flatMap((effect) =>
        effect.paths.length === 1 &&
        ((effect.kind === "create_file" &&
          typeof effect.contentSha256 === "string") ||
          (effect.kind === "create_directory" && effect.contentSha256 === null))
          ? [
              {
                path: effect.paths[0],
                kind:
                  effect.kind === "create_file"
                    ? ("file" as const)
                    : ("directory" as const),
                sha256: effect.contentSha256!,
              },
            ]
          : [],
      ),
      changedArtifacts: mapChangedArtifacts(plan.effects),
      createdAt: ctx.timestamp(),
      limitations: [
        ...plan.coverage.limitations,
        "Advisory lease не исключает внешние native writers.",
        "Task refs не означают доставку или приёмку результата.",
      ],
    });
    record.payload.state = "completed";
    record.payload.writeBlock = null;
    record.payload.error = null;
    return mapOperation(ctx.persist(record, "completed"));
  } catch (error) {
    const d = record.payload;
    const fullyConfirmed =
      d.pending === null && d.cursor === d.plan!.prepared.effects.length;
    d.effects =
      d.pending !== null
        ? "unknown"
        : d.cursor === 0
          ? "none"
          : fullyConfirmed
            ? "applied"
            : "partial";
    d.state = fullyConfirmed
      ? "failed"
      : d.pending !== null || d.cursor > 0
        ? "recovery_required"
        : "conflict";
    if (fullyConfirmed) d.checks = "stale";
    d.writeBlock =
      d.writeBlock === "writer_unconfirmed"
        ? d.writeBlock
        : d.state === "recovery_required"
          ? "fs_unresolved"
          : null;
    d.error = ctx.safeError(error, record.operationId);
    return mapOperation(ctx.persist(record, "execution_interrupted"));
  }
}

export async function applyOperation(
  ctx: EngineeringContext,
  command: ApplyCommand,
) {
  let record = ctx.load(command.operationId);
  await ctx.authorize("apply", record);
  const request = ctx.request("apply", command);
  const replay = ctx.replay(request);
  if (replay) return mapOperation(replay);
  return ctx.store.withWorkspaceLease(async (lease) => {
    record = ctx.load(command.operationId);
    await ctx.authorize("apply", record);
    const replayAfterLock = ctx.replay(request);
    if (replayAfterLock) return mapOperation(replayAfterLock);
    ctx.compareRevision(record, command.expectedRevision);
    ctx.assertUnblocked();
    const plan = record.payload.plan;
    if (
      record.payload.state !== "planned" ||
      !plan ||
      plan.public.planId !== command.planId ||
      plan.public.planHash !== command.planHash
    )
      return failure("CONFLICT", "Не совпадает применяемый frozen plan.");
    if (Date.parse(plan.public.expiresAt) <= ctx.now())
      return failure("EXPIRED", "Срок плана истёк.");
    requireEffects(ctx, record);
    lease.assertHeld();
    if (ctx.snapshot(record) !== plan.prepared.snapshots[0])
      return failure("CONFLICT", "Исходный manifest изменился.");
    record.payload.state = "applying";
    record.payload.writeBlock = "fs_unresolved";
    record.payload.executionMode = plan.prepared.effects.length
      ? "in_process_sync"
      : "none";
    record.payload.attempt = 1;
    record.payload.activeRequestHash = request.hash;
    record = ctx.persist(record, "apply_admitted", request);
    return executeFrozenSteps(ctx, record, lease);
  });
}
