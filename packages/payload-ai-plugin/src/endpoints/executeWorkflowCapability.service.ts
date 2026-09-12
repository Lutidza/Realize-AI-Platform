/**
 * @file packages/payload-ai-plugin/src/endpoints/executeWorkflowCapability.service.ts
 * @version 1.1.0
 * @date 2026-09-11
 * @description Подготавливает typed Data Operation из разрешённого capability шага без применения.
 * @see documentation/specifications/realize-ai-commerce/v1.0/01-architecture/10-ai-codex-layer-integration.md
 */
import { parseDataOperationIntent } from "@realize/ai-contracts";
import { SYSTEM_CAPABILITY_REGISTRY } from "@realize/change-engine";
import { createTypedDataOperationPlan } from "./createTypedDataOperationPlan.service";
import { EndpointError } from "./http";
import { requireWorkflowDataLane } from "./requireWorkflowDataLane.service";
import type {
  ExecuteWorkflowCapabilityInput,
  ExecuteWorkflowCapabilityResult,
} from "./WorkflowDataLane.types";

/** Регистрация descriptor и narrowing проверяются до разрешения selectors или записи preview. */
export const executeWorkflowCapability = async (
  input: ExecuteWorkflowCapabilityInput,
): Promise<ExecuteWorkflowCapabilityResult> => {
  const configuration = await requireWorkflowDataLane(input);
  const binding = configuration.compiled.capabilities.find(
    (item) => item.bindingKey === input.capabilityBindingKey,
  );
  const artifact = configuration.compiled.selectedArtifacts.find(
    ({ artifact }) =>
      artifact.kind === "capability_binding" &&
      artifact.key === input.capabilityBindingKey,
  )?.artifact;
  if (!binding || artifact?.kind !== "capability_binding" || !artifact.enabled)
    throw new EndpointError(
      "FORBIDDEN",
      "Возможность не входит в разрешённую конфигурацию процесса.",
      403,
    );
  const descriptor = SYSTEM_CAPABILITY_REGISTRY.get(binding.capability);
  if (
    !descriptor ||
    !["catalog.assignCategory.v1", "pages.createDraft.v1"].includes(
      descriptor.id,
    ) ||
    descriptor.version !== "1.0" ||
    descriptor.inputSchema.id !==
      (descriptor.id === "pages.createDraft.v1"
        ? "pages.createDraft.input"
        : "catalog.assignCategory.input") ||
    descriptor.inputSchema.version !== "1.0" ||
    !descriptor.projectProfiles.includes(
      configuration.compiled.projectProfile,
    ) ||
    !binding.actions.includes(
      descriptor.id === "pages.createDraft.v1"
        ? "page.createDraft"
        : "category.assign",
    ) ||
    binding.actions.some(
      (action) =>
        !descriptor.actions.includes(action) ||
        !artifact.allowedActions.includes(action),
    ) ||
    binding.maxTargets !== 1 ||
    binding.maxTargets >
      (artifact.maxTargets ?? descriptor.limits.maxTargets) ||
    !descriptor.scopes.read.every((scope) =>
      binding.readScopes.includes(scope),
    ) ||
    binding.readScopes.some(
      (scope) =>
        !descriptor.scopes.read.includes(scope) ||
        !(artifact.readScopes ?? descriptor.scopes.read).includes(scope),
    ) ||
    !descriptor.scopes.write.every((scope) =>
      binding.writeScopes.includes(scope),
    ) ||
    binding.writeScopes.some(
      (scope) =>
        !descriptor.scopes.write.includes(scope) ||
        !(artifact.writeScopes ?? descriptor.scopes.write).includes(scope),
    )
  )
    throw new EndpointError(
      "FORBIDDEN",
      "Ограничения возможности не разрешают подготовить эту операцию данных.",
      403,
    );
  const intent = parseDataOperationIntent(input.input);
  if (intent.kind !== descriptor.id)
    throw new EndpointError(
      "FORBIDDEN",
      "Тип операции не совпадает с разрешённой возможностью.",
      403,
    );
  const operation = await createTypedDataOperationPlan({
    conversationID: input.conversationID,
    intent,
    payload: input.req.payload,
    req: input.req,
    sourceMessageID: input.sourceMessageID,
    userID: input.userID,
    source: {
      type: "workflow",
      rootRunID: input.rootRunID,
      stepKey: input.stepKey,
      compiledContextHash: configuration.compiled.compiledContextHash,
      capabilityBindingKey: input.capabilityBindingKey,
    },
  });
  if (
    operation.state !== "awaiting_approval" ||
    !Number.isFinite(Date.parse(String(operation.expiresAt))) ||
    Date.parse(String(operation.expiresAt)) <= Date.now()
  )
    throw new EndpointError(
      "CONFLICT",
      "Подготовленная операция уже изменила состояние или истекла. Процесс остановлен.",
      409,
    );
  const dataOperationID = String(operation.id);
  const operationHash = String(operation.operationHash);
  return {
    output: { dataOperationID, state: "awaiting_approval", operationHash },
    lastCapability: { stepKey: input.stepKey, dataOperationID, operationHash },
  };
};
