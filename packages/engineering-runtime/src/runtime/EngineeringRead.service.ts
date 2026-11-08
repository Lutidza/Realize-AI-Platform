/**
 * @file packages/engineering-runtime/src/runtime/EngineeringRead.service.ts
 * @version 1.0.0
 * @date 2026-10-26
 * @description Возвращает ограниченный preview и события без передачи приватного journal.
 * @see documentation/architecture/engineering-operations.md
 */
import { engineeringIdentity } from "./engineeringIdentity.util.ts";
import type {
  EventsCommand,
  PreviewCommand,
} from "../contracts/EngineeringCommand.types.ts";
import type { EngineeringContext } from "./EngineeringContext.service.ts";
import type { EventPage, PreviewPage } from "./EngineeringResult.types.ts";
import { hashEngineeringValue } from "../contracts/hashEngineeringValue.util.ts";
import { EngineeringFailure, failure } from "./EngineeringFailure.error.ts";

export async function previewOperation(
  ctx: EngineeringContext,
  command: PreviewCommand,
): Promise<PreviewPage> {
  const record = ctx.load(command.operationId);
  const scopeVersion = await ctx.authorize("preview", record);
  const source = record.payload.plan?.public;
  if (!source || source.planId !== command.planId)
    return failure("NOT_FOUND", "План не найден.");
  const { effects, ...plan } = structuredClone(source);
  const scope = `preview:${source.operationId}:${source.planId}`;
  const offset = ctx.cursors(scopeVersion).read(command.after, scope);
  if (offset > effects.length)
    return failure("INVALID_INPUT", "Cursor вышел за границы плана.");
  const page: typeof effects = [];
  // Оставляем запас под envelope/cursor; один diff ограничен 128KiB.
  let bytes = Buffer.byteLength(JSON.stringify(plan)) + 4096;
  let diffBytes = 0;
  for (const item of effects.slice(offset, offset + command.limit)) {
    const size = Buffer.byteLength(JSON.stringify(item));
    const diffSize = Buffer.byteLength(item.diff ?? "");
    if (bytes + size > 256 * 1024 || diffBytes + diffSize > 128 * 1024) break;
    page.push(item);
    bytes += size;
    diffBytes += diffSize;
  }
  if (!page.length && offset < effects.length)
    return failure(
      "LIMIT_EXCEEDED",
      "Один элемент preview превышает бюджет страницы.",
    );
  const hasMore = offset + page.length < effects.length;
  return {
    plan,
    effects: page,
    hasMore,
    nextCursor: hasMore
      ? ctx.cursors(scopeVersion).issue(scope, offset + page.length)
      : null,
  };
}

export async function readEvents(
  ctx: EngineeringContext,
  command: EventsCommand,
): Promise<EventPage> {
  ctx.target(command.targetId);
  const scopeVersion = await ctx.authorize("events");
  const scope = `events:${command.targetId}`;
  const afterSeq = ctx.cursors(scopeVersion).read(command.after, scope);
  const rows = ctx.store.listEvents({ afterSeq, limit: command.limit });
  const events: EventPage["events"] = [];
  let complete = true;
  let lastSeq = afterSeq;
  let bytes = 4096;
  const epoch = engineeringIdentity(
    hashEngineeringValue({ publicEventEpoch: ctx.store.binding.epoch }),
  );
  for (const row of rows) {
    // Event не раскрывает даже operation ID, если её предметный допуск отозван.
    const record = ctx.load(row.operationId);
    try {
      if ((await ctx.authorize("get", record)) !== scopeVersion)
        failure(
          "EXPIRED",
          "Область доступа изменилась: требуется resync snapshot.",
        );
    } catch (error) {
      if (!(error instanceof EngineeringFailure) || error.code !== "FORBIDDEN")
        throw error;
      complete = false;
      lastSeq = row.seq;
      continue;
    }
    const event: EventPage["events"][number] = {
      schemaVersion: 1,
      id: engineeringIdentity(hashEngineeringValue({ epoch, seq: row.seq })),
      workspaceId: ctx.store.binding.workspaceId,
      epoch,
      seq: row.seq,
      operationId: row.operationId,
      attempt: row.attempt,
      origin: "typed",
      kind: row.kind,
      observedAt: row.at,
      changedPathRefs: [],
      manifestRef: row.manifestRef,
      causationId: null,
      coverage: { complete: true },
    };
    const size = Buffer.byteLength(JSON.stringify(event));
    if (bytes + size > 256 * 1024) break;
    events.push(event);
    bytes += size;
    lastSeq = row.seq;
  }
  const hasMore =
    ctx.store.listEvents({ afterSeq: lastSeq, limit: 1 }).length > 0;
  return {
    events,
    nextCursor: ctx.cursors(scopeVersion).issue(scope, lastSeq),
    hasMore,
    coverage: { complete },
  };
}
