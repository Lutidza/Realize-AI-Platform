/**
 * @file packages/payload-ai-plugin/src/endpoints/executeWorkflowCheck.service.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Проверяет фактический preview последнего capability шага данного процесса.
 * @see documentation/specifications/realize-ai-commerce/v1.0/01-architecture/10-ai-codex-layer-integration.md
 */
import { parseAssignProductCategoryIntent } from "@realize/ai-contracts";
import {
  createCategoryAssignmentOperationHash,
  hashCanonicalJSON,
  SYSTEM_CHECK_IDS,
} from "@realize/change-engine";
import { CatalogCategoryAssignment } from "./catalogCategoryAssignment";
import { DataOperationAuditRepository } from "./dataOperationAuditRepository";
import { DataOperationRepository } from "./dataOperationRepository";
import { EndpointError } from "./http";
import { relationID } from "./mappers";
import { requireWorkflowDataLane } from "./requireWorkflowDataLane.service";
import type {
  ExecuteWorkflowCheckInput,
  ExecuteWorkflowCheckResult,
} from "./WorkflowDataLane.types";

/** Ни successful flag из checkpoint, ни наличие check ID не заменяет чтение текущих данных. */
export const executeWorkflowCheck = async (
  input: ExecuteWorkflowCheckInput,
): Promise<ExecuteWorkflowCheckResult> => {
  const configuration = await requireWorkflowDataLane(input);
  const binding = configuration.compiled.selectedArtifacts.find(
    ({ artifact }) =>
      artifact.kind === "check_binding" &&
      artifact.key === input.checkBindingKey,
  )?.artifact;
  if (
    binding?.kind !== "check_binding" ||
    !binding.enabled ||
    !configuration.compiled.checkIDs.includes(binding.checkID) ||
    !SYSTEM_CHECK_IDS.includes(binding.checkID)
  )
    throw new EndpointError(
      "FORBIDDEN",
      "Проверка не входит в текущую конфигурацию и системный реестр.",
      403,
    );
  const lastCapability = input.lastCapability;
  if (!lastCapability)
    throw new EndpointError(
      "CONFLICT",
      "Для проверки нужна подготовленная операция предыдущего шага этого процесса.",
      409,
    );
  const operation = await new DataOperationRepository(
    input.req.payload,
    input.req,
  ).getOwnedOperation(lastCapability.dataOperationID, input.userID);
  if (
    relationID(operation.conversation) !== input.conversationID ||
    relationID(operation.requestedBy) !== String(input.userID) ||
    operation.operationHash !== lastCapability.operationHash ||
    operation.state !== "awaiting_approval" ||
    !Number.isFinite(Date.parse(String(operation.expiresAt))) ||
    Date.parse(String(operation.expiresAt)) <= Date.now()
  )
    throw new EndpointError(
      "CONFLICT",
      "Операция проверки недоступна, изменилась или больше не ожидает подтверждения.",
      409,
    );

  const event = await new DataOperationAuditRepository(
    input.req.payload,
    input.req,
  ).getPreviewEvent(lastCapability.dataOperationID);
  const eventPayload = event?.payload as Record<string, unknown> | undefined;
  const provenance = eventPayload?.workflow as
    Record<string, unknown> | undefined;
  if (
    !event ||
    eventPayload?.operationHash !== lastCapability.operationHash ||
    provenance?.type !== "workflow" ||
    provenance.rootRunID !== input.rootRunID ||
    provenance.stepKey !== lastCapability.stepKey ||
    provenance.compiledContextHash !==
      configuration.compiled.compiledContextHash
  )
    throw new EndpointError(
      "CONFLICT",
      "Не найдено подтверждённое audit-событие операции этого процесса.",
      409,
    );

  // Все четыре Data Lane checks повторно проверяют доступные selectors и exact before state.
  // Проверка audit дополнительно требует реально сохранённое событие выше; writes не выполняются.
  const resolved = await new CatalogCategoryAssignment(
    input.req.payload,
    input.req,
  ).dryRun(parseAssignProductCategoryIntent(operation.intent));
  const currentHash = createCategoryAssignmentOperationHash({
    afterCategoryIDs: resolved.afterCategoryIDs,
    beforeCategoryIDs: resolved.beforeCategoryIDs,
    categoryID: resolved.preview.category.id,
    expectedTargetUpdatedAt: resolved.expectedTargetUpdatedAt,
    productID: resolved.preview.product.id,
  });
  if (
    currentHash !== lastCapability.operationHash ||
    relationID(operation.product) !== resolved.preview.product.id ||
    relationID(operation.category) !== resolved.preview.category.id ||
    eventPayload?.productID !== resolved.preview.product.id ||
    eventPayload?.categoryID !== resolved.preview.category.id ||
    eventPayload?.expectedTargetUpdatedAt !== resolved.expectedTargetUpdatedAt
  )
    throw new EndpointError(
      "CONFLICT",
      "Товар, категория или версия данных изменились после подготовки операции.",
      409,
    );
  return {
    checkID: binding.checkID,
    status: "passed",
    dataOperationID: lastCapability.dataOperationID,
    operationHash: currentHash,
    evidenceHash: hashCanonicalJSON({
      checkID: binding.checkID,
      dataOperationID: lastCapability.dataOperationID,
      operationHash: currentHash,
      auditEventID: String(event.id),
      compiledContextHash: configuration.compiled.compiledContextHash,
    }),
  };
};
