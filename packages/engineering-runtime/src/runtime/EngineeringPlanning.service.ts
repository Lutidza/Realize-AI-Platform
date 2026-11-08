/**
 * @file packages/engineering-runtime/src/runtime/EngineeringPlanning.service.ts
 * @version 1.1.0
 * @date 2026-10-28
 * @description Резервирует request и сохраняет воспроизводимый immutable план.
 * @see documentation/architecture/engineering-operations.md
 */
import { randomUUID } from "node:crypto";
import type { PlanCommand } from "../contracts/EngineeringCommand.types.ts";
import type { StoredOperation } from "../storage/engineeringStorage.index.ts";
import type { RuntimeRecord } from "./EngineeringRuntime.types.ts";
import type { EngineeringContext } from "./EngineeringContext.service.ts";
import { failure } from "./EngineeringFailure.error.ts";
import { mapOperation } from "./EngineeringOperation.mapper.ts";
import { validatePreparedPlan } from "./preparedPlan.validator.ts";

export async function planOperation(
  ctx: EngineeringContext,
  command: PlanCommand,
) {
  ctx.target(command.targetId);
  await ctx.authorize("plan", null, command.intent);
  const request = ctx.request("plan", command);
  const replay = ctx.replay(request);
  if (replay) {
    await ctx.authorize("plan", replay);
    await ctx.authorizeEffects(replay);
    return mapOperation(replay);
  }
  if (command.intent.kind !== "file_batch")
    return failure("UNSUPPORTED", "Генераторы ещё не подключены.");
  return ctx.store.withWorkspaceLease(async (lease) => {
    await ctx.authorize("plan", null, command.intent);
    const replayAfterLock = ctx.replay(request);
    if (replayAfterLock) {
      await ctx.authorize("plan", replayAfterLock);
      await ctx.authorizeEffects(replayAfterLock);
      return mapOperation(replayAfterLock);
    }
    ctx.assertUnblocked();
    lease.assertHeld();
    let record: RuntimeRecord = {
      operationId: randomUUID(),
      workspaceId: ctx.store.binding.workspaceId,
      revision: 0,
      state: "planning",
      writeBlock: null,
      payload: {
        version: 1,
        plan: null,
        intent: command.intent,
        taskRefs: command.taskRefs,
        state: "planning",
        attempt: 0,
        cursor: 0,
        pending: null,
        effects: "none",
        checks: "not_run",
        executionMode: "none",
        cancelState: "none",
        writeBlock: null,
        error: null,
        activeRequestHash: request.hash,
        receipts: [],
      },
    };
    ctx.store.transaction((tx) => {
      tx.insertOperation(record as unknown as StoredOperation);
      tx.insertRequest({ ...request, operationId: record.operationId });
      ctx.event(tx, record, "planning");
    });
    try {
      const started = ctx.now();
      const prepared = validatePreparedPlan(
        ctx.options.planner.prepare(structuredClone(command)),
      );
      if (ctx.now() - started > 30_000)
        failure(
          "LIMIT_EXCEEDED",
          "Превышен срок подготовки плана.",
          "planning",
        );
      lease.assertHeld();
      const planHash = ctx.digest(prepared, command.intent, command.taskRefs);
      record.payload.plan = {
        prepared,
        intent: command.intent,
        public: {
          schemaVersion: 1,
          operationId: record.operationId,
          planId: randomUUID(),
          planHash,
          createdAt: ctx.timestamp(),
          expiresAt: new Date(ctx.now() + 30 * 60_000).toISOString(),
          targetRef: { id: command.targetId, version: prepared.targetVersion },
          sourceManifestHash: prepared.sourceManifestHash,
          policyRefs: prepared.policyRefs,
          recipeRefs: prepared.recipeRefs,
          effects: prepared.effects,
          checkSelection: prepared.checkSelection,
          taskRefs: command.taskRefs,
          coverage: prepared.coverage,
          budgets: { maxEffects: 64, maxStoredBytes: 256 * 1024 },
        },
      };
      await ctx.authorizeEffects(record);
      lease.assertHeld();
      record.payload.state = "planned";
      record = ctx.persist(record, "planned");
    } catch (error) {
      record.payload.plan = null;
      record.payload.state = "failed";
      record.payload.error = ctx.safeError(error, record.operationId);
      record = ctx.persist(record, "planning_failed");
    }
    return mapOperation(record);
  });
}
