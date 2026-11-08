/**
 * @file packages/engineering-runtime/src/runtime/EngineeringContext.service.ts
 * @version 1.1.1
 * @date 2026-10-29
 * @description Обеспечивает допуск, request identity и атомарные переходы общего журнала.
 * @see documentation/architecture/engineering-operations.md
 */
import { hashEngineeringValue } from "../contracts/hashEngineeringValue.util.ts";
import type {
  JsonValue,
  PlanCommand,
} from "../contracts/EngineeringCommand.types.ts";
import type {
  StorageTransaction,
  StoredOperation,
} from "../storage/engineeringStorage.index.ts";
import type {
  EngineeringRuntimeOptions,
  PreparedPlan,
  RuntimeRecord,
} from "./EngineeringRuntime.types.ts";
import { EngineeringFailure, failure } from "./EngineeringFailure.error.ts";
import { EngineeringCursor } from "./EngineeringCursor.service.ts";

/** Внутренний контекст одного trusted actor/client/checkout, никогда не создаётся из DTO. */
export class EngineeringContext {
  readonly now: () => number;
  cursors(scopeVersion: string) {
    return new EngineeringCursor(
      this.store.binding.epoch,
      hashEngineeringValue({ ...this.options.principal, scopeVersion }),
      this.now,
    );
  }
  constructor(readonly options: EngineeringRuntimeOptions) {
    this.now = options.now ?? Date.now;
  }
  get store() {
    return this.options.store;
  }
  timestamp() {
    return new Date(this.now()).toISOString();
  }
  target(id: string) {
    if (id !== this.store.binding.targetId)
      failure("FORBIDDEN", "Цель не разрешена этим binding.");
  }
  async authorize(
    command: string,
    record: RuntimeRecord | null = null,
    intent: PlanCommand["intent"] | null = null,
    index: number | null = null,
  ) {
    try {
      const admission = await this.options.authorize({
        command,
        targetId: this.store.binding.targetId,
        operationId: record?.operationId ?? null,
        intent: record?.payload.intent ?? intent,
        effect:
          index === null
            ? null
            : (record?.payload.plan?.public.effects[index] ?? null),
      });
      if (
        !admission ||
        typeof admission.scopeVersion !== "string" ||
        !admission.scopeVersion.length ||
        admission.scopeVersion.length > 256
      )
        throw new Error();
      return admission.scopeVersion;
    } catch {
      failure("FORBIDDEN", "Нет актуального допуска к операции.");
    }
  }
  /** Expanded consumers проходят допуск целиком до выдачи плана и перед первым оставшимся write. */
  async authorizeEffects(record: RuntimeRecord, from = 0): Promise<void> {
    for (
      let index = from;
      index < (record.payload.plan?.public.effects.length ?? 0);
      index++
    )
      await this.authorize("effect", record, null, index);
  }
  digest(
    prepared: PreparedPlan,
    intent: PlanCommand["intent"],
    taskRefs: string[],
  ): string {
    const b = this.store.binding;
    return hashEngineeringValue({
      installationId: b.installationId,
      workspaceId: b.workspaceId,
      targetId: b.targetId,
      rootIdentity: b.rootIdentity,
      prepared,
      intent,
      taskRefs,
    });
  }
  load(id: string): RuntimeRecord {
    const raw = this.store.getOperation(id);
    if (!raw || raw.workspaceId !== this.store.binding.workspaceId)
      return failure("NOT_FOUND", "Операция не найдена.");
    const record = structuredClone(raw) as unknown as RuntimeRecord;
    const d = record.payload;
    if (
      !d ||
      d.version !== 1 ||
      d.state !== record.state ||
      d.writeBlock !== record.writeBlock ||
      !Number.isSafeInteger(d.cursor) ||
      d.cursor < 0 ||
      !Array.isArray(d.receipts)
    )
      return failure(
        "RECOVERY_REQUIRED",
        "Journal требует проверки целостности.",
      );
    if (
      d.plan &&
      (this.digest(d.plan.prepared, d.intent, d.taskRefs) !==
        d.plan.public.planHash ||
        d.cursor > d.plan.prepared.effects.length ||
        (d.pending !== null && d.pending !== d.cursor))
    )
      return failure("RECOVERY_REQUIRED", "Frozen plan или cursor повреждены.");
    if (d.plan) {
      const p = d.plan.prepared,
        v = d.plan.public;
      const projection = {
        targetRef: {
          id: this.store.binding.targetId,
          version: p.targetVersion,
        },
        sourceManifestHash: p.sourceManifestHash,
        policyRefs: p.policyRefs,
        recipeRefs: p.recipeRefs,
        effects: p.effects,
        checkSelection: p.checkSelection,
        taskRefs: d.taskRefs,
        coverage: p.coverage,
      };
      const actual = {
        targetRef: v.targetRef,
        sourceManifestHash: v.sourceManifestHash,
        policyRefs: v.policyRefs,
        recipeRefs: v.recipeRefs,
        effects: v.effects,
        checkSelection: v.checkSelection,
        taskRefs: v.taskRefs,
        coverage: v.coverage,
      };
      if (
        v.operationId !== id ||
        hashEngineeringValue(projection) !== hashEngineeringValue(actual) ||
        hashEngineeringValue(d.plan.intent) !== hashEngineeringValue(d.intent)
      )
        failure(
          "RECOVERY_REQUIRED",
          "Проекция плана не совпадает с frozen manifest.",
        );
    }
    return record;
  }
  request(
    command: string,
    body: { requestId: string },
  ): { key: string; hash: string } {
    const b = this.store.binding;
    return {
      key: hashEngineeringValue({
        installationId: b.installationId,
        workspaceId: b.workspaceId,
        principal: this.options.principal,
        command,
        requestId: body.requestId,
      }),
      hash: hashEngineeringValue(body),
    };
  }
  replay(request: { key: string; hash: string }): RuntimeRecord | null {
    const found = this.store.getRequest(request.key);
    if (!found) return null;
    if (found.hash !== request.hash)
      return failure("CONFLICT", "Этот requestId уже принят с другим телом.");
    return this.load(found.operationId);
  }
  persist(
    record: RuntimeRecord,
    kind: string,
    request?: { key: string; hash: string },
  ): RuntimeRecord {
    const next = structuredClone(record);
    const previousRevision = next.revision;
    next.revision++;
    next.state = next.payload.state;
    next.writeBlock = next.payload.writeBlock;
    const finishing =
      kind !== "apply_admitted" &&
      this.store.getOperation(record.operationId)?.writeBlock !== null;
    this.store.transaction(
      (tx) => {
        if (kind === "apply_admitted" || kind === "recovery_admitted")
          tx.reserveFinishCapacity(record.operationId, {
            events:
              2 *
                (record.payload.plan!.prepared.effects.length -
                  record.payload.cursor) +
              8,
            bytes: 1024 * 1024,
            requests: 2,
          });
        if (request)
          tx.insertRequest({ ...request, operationId: next.operationId });
        tx.replaceOperation(
          next as unknown as StoredOperation,
          previousRevision,
        );
        this.event(tx, next, kind);
        if (next.writeBlock === null)
          tx.releaseFinishCapacity(next.operationId);
      },
      finishing ? { finishOperationId: record.operationId } : undefined,
    );
    return next;
  }
  event(tx: StorageTransaction, record: RuntimeRecord, kind: string) {
    tx.appendEvent({
      operationId: record.operationId,
      revision: record.revision,
      kind,
      at: this.timestamp(),
      attempt: record.payload.attempt,
      manifestRef:
        record.payload.pending === null
          ? (record.payload.plan?.prepared.snapshots[record.payload.cursor] ??
            null)
          : null,
    });
  }
  compareRevision(record: RuntimeRecord, revision: number) {
    if (record.revision !== revision)
      failure("CONFLICT", "Revision операции изменилась.");
  }
  assertUnblocked(except?: string) {
    if (
      this.store.listBlockedOperations().some((r) => r.operationId !== except)
    )
      failure("RECOVERY_REQUIRED", "В workspace есть неразрешённая запись.");
  }
  snapshot(record: RuntimeRecord): string {
    if (!record.payload.plan)
      return failure("CONFLICT", "У операции нет frozen plan.");
    try {
      const hash = this.options.planner.snapshot(
        structuredClone(record.payload.plan),
      );
      if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error();
      return hash;
    } catch (error) {
      if (error instanceof EngineeringFailure && error.code === "FORBIDDEN")
        return failure(
          "FORBIDDEN",
          "Нет актуального допуска к чтению manifest.",
          "snapshot",
        );
      return failure(
        "DEPENDENCY_UNAVAILABLE",
        "Не удалось подтвердить полный manifest.",
        "snapshot",
      );
    }
  }
  /** Не передаёт исключения adapters клиенту: они могут содержать credentials или OS paths. */
  safeError(error: unknown, operationId: string) {
    return (
      error instanceof EngineeringFailure
        ? error
        : new EngineeringFailure(
            "INTERNAL_ERROR",
            "Внутренняя операция завершилась ошибкой.",
          )
    ).toDTO(operationId);
  }
  asJson(value: unknown): JsonValue {
    return value as JsonValue;
  }
}
