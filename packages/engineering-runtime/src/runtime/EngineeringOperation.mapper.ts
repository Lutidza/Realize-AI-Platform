/**
 * @file packages/engineering-runtime/src/runtime/EngineeringOperation.mapper.ts
 * @version 1.0.0
 * @date 2026-10-26
 * @description Проецирует приватный journal в явный публичный DTO.
 * @see documentation/architecture/engineering-operations.md
 */
import type { OperationView } from "./EngineeringResult.types.ts";
import type { RuntimeRecord } from "./EngineeringRuntime.types.ts";

export function mapOperation(record: RuntimeRecord): OperationView {
  const d = record.payload;
  const plan = d.plan?.public;
  return {
    schemaVersion: 1,
    operationId: record.operationId,
    revision: record.revision,
    state: d.state,
    attempt: d.attempt,
    planRef: plan ? { planId: plan.planId, planHash: plan.planHash } : null,
    effectsSummary: d.effects,
    checksSummary: d.checks,
    bindingState: "not_required",
    receiptRef: d.receipts.at(-1)?.id ?? null,
    cancelState: d.cancelState,
    writeBlock: d.writeBlock,
    error: d.error ? { ...d.error } : null,
    nextAction: d.writeBlock
      ? "inspectRecovery"
      : d.state === "planned"
        ? "apply"
        : null,
  };
}
