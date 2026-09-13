/**
 * @file packages/payload-ai-plugin/src/endpoints/createTypedDataOperationPlan.service.ts
 * @version 1.2.0
 * @date 2026-09-12
 * @description Создаёт один immutable preview из проверенного intent с durable replay и audit.
 * @see documentation/specifications/realize-ai-commerce/v1.0/02-change-engine-and-pipelines/14-data-config-pipeline.md
 */
import { parseDataOperationIntent } from "@realize/ai-contracts";
import {
  createPageDraftRollbackHash,
  createPageDraftUpdateRollbackHash,
  createCategoryAssignmentOperationHash,
  createCategoryAssignmentRollbackHash,
  hashCanonicalJSON,
} from "@realize/change-engine";
import { PageDraftCreation } from "./pageDraftCreation.service";
import { PageDraftUpdate } from "./pageDraftUpdate.service";
import { CatalogCategoryAssignment } from "./catalogCategoryAssignment";
import { DataOperationAuditRepository } from "./dataOperationAuditRepository";
import { DataOperationRepository } from "./dataOperationRepository";
import type { TypedDataOperationPlanInput } from "./DataOperationPlanning.types";
import { EndpointError } from "./http";
import { assertDataOperationSource } from "./assertDataOperationSource.validator";
import { relationID } from "./mappers";
import { withPayloadTransaction } from "./payloadTransaction";
import { redactText } from "./redaction";
import { AIRepository, type AIDocument } from "./repository";

/** Не применяет изменения. Workflow dedup привязан к root run и шагу, assistant сохраняет прежний source dedup. */
export const createTypedDataOperationPlan = async (
  input: TypedDataOperationPlanInput,
): Promise<AIDocument> => {
  input = { ...input, intent: parseDataOperationIntent(input.intent) };
  const conversations = new AIRepository(input.payload, input.req);
  const repository = new DataOperationRepository(input.payload, input.req);
  const audit = new DataOperationAuditRepository(input.payload, input.req);
  let originalRequest: AIDocument | undefined;
  if (input.source.type === "workflow") {
    originalRequest = await repository.requireWorkflowSourceMessage({
      conversationID: input.conversationID,
      sourceMessageID: input.sourceMessageID,
      rootRunID: input.source.rootRunID,
      userID: input.userID,
    });
  } else {
    const detail = await conversations.getConversationDetail(
      input.conversationID,
      input.userID,
    );
    const assistant = detail.messages.find(
      (message) =>
        String(message.id) === input.sourceMessageID &&
        message.role === "assistant",
    );
    if (assistant)
      originalRequest = [...detail.messages]
        .reverse()
        .find(
          (message) =>
            message.role === "user" &&
            (input.intent.kind !== "pages.updateDraft.v1" ||
              (typeof assistant.runID === "string" &&
                message.runID === assistant.runID)) &&
            Number(message.sequence) < Number(assistant.sequence),
        );
  }
  if (!originalRequest)
    throw new EndpointError(
      "INVALID_REQUEST",
      "У операции нет сохранённого источника и предшествующего запроса пользователя.",
      400,
    );
  const sourceMessageKey =
    input.source.type === "workflow"
      ? `workflow:${hashCanonicalJSON({ rootRunID: input.source.rootRunID, stepKey: input.source.stepKey })}`
      : undefined;
  const idempotencyKey =
    input.source.type === "assistant"
      ? input.source.idempotencyKey
      : sourceMessageKey!;
  const requestHash = hashCanonicalJSON({
    conversationID: input.conversationID,
    sourceMessageID: input.sourceMessageID,
    userID: String(input.userID),
    source: input.source,
    intent: input.intent,
  });
  const findExisting = async () =>
    (await repository.findByIdempotencyKey(input.userID, idempotencyKey)) ||
    (input.source.type === "assistant"
      ? await repository.findBySourceMessage(
          input.conversationID,
          input.sourceMessageID,
        )
      : undefined);
  const assertReplay = async (operation: AIDocument): Promise<AIDocument> => {
    if (input.source.type === "assistant") {
      assertDataOperationSource(operation, input);
      return operation;
    }
    const event = await audit.getPreviewEvent(String(operation.id));
    const payload = event?.payload as Record<string, unknown> | undefined;
    const workflow = payload?.workflow as Record<string, unknown> | undefined;
    if (
      relationID(operation.conversation) !== input.conversationID ||
      relationID(operation.sourceMessage) !== input.sourceMessageID ||
      relationID(operation.requestedBy) !== String(input.userID) ||
      workflow?.requestHash !== requestHash ||
      hashCanonicalJSON(operation.intent) !== hashCanonicalJSON(input.intent)
    )
      throw new EndpointError(
        "CONFLICT",
        "Шаг процесса уже связан с другим запросом операции данных.",
        409,
      );
    return operation;
  };
  const existing = await findExisting();
  if (existing) return await assertReplay(existing);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1_000).toISOString();
  let planned: Parameters<DataOperationRepository["createOperation"]>[0];
  const common = {
    conversationID: input.conversationID,
    expiresAt,
    idempotencyKey,
    intent: input.intent,
    originalRequest: redactText(String(originalRequest.content || "")),
    requestedBy: input.userID,
    sourceMessageID: input.sourceMessageID,
    sourceMessageKey,
  };
  if (input.intent.kind === "pages.updateDraft.v1") {
    const pages = new PageDraftUpdate(input.payload, input.req);
    const snapshot = await pages.dryRun(input.intent);
    const operationHash = pages.operationHash(input.intent, snapshot);
    planned = {
      ...common,
      kind: input.intent.kind,
      afterSnapshot: snapshot,
      beforeSnapshot: snapshot.beforePage,
      expectedTargetUpdatedAt: snapshot.context.updatedAt,
      operationHash,
      rollbackHash: createPageDraftUpdateRollbackHash({ operationHash }),
      title: `Изменить черновик «${snapshot.context.page.title}»`.slice(0, 120),
    };
  } else if (input.intent.kind === "pages.createDraft.v1") {
    const pages = new PageDraftCreation(input.payload, input.req);
    const snapshot = await pages.dryRun(input.intent);
    const operationHash = pages.operationHash(input.intent, snapshot);
    planned = {
      ...common,
      kind: input.intent.kind,
      afterSnapshot: snapshot,
      beforeSnapshot: { exists: false },
      operationHash,
      rollbackHash: createPageDraftRollbackHash({ operationHash }),
      title: `Создать черновик «${input.intent.title}»`.slice(0, 120),
    };
  } else {
    const resolved = await new CatalogCategoryAssignment(
      input.payload,
      input.req,
    ).dryRun(input.intent);
    const operationHash = createCategoryAssignmentOperationHash({
      afterCategoryIDs: resolved.afterCategoryIDs,
      beforeCategoryIDs: resolved.beforeCategoryIDs,
      categoryID: resolved.preview.category.id,
      expectedTargetUpdatedAt: resolved.expectedTargetUpdatedAt,
      productID: resolved.preview.product.id,
    });
    planned = {
      ...common,
      afterSnapshot: resolved.preview.afterCategories,
      beforeSnapshot: resolved.preview.beforeCategories,
      categoryID: resolved.preview.category.id,
      categorySnapshot: resolved.preview.category,
      expectedTargetUpdatedAt: resolved.expectedTargetUpdatedAt,
      operationHash,
      productID: resolved.preview.product.id,
      productSnapshot: resolved.preview.product,
      rollbackHash: createCategoryAssignmentRollbackHash({
        afterCategoryIDs: resolved.afterCategoryIDs,
        beforeCategoryIDs: resolved.beforeCategoryIDs,
        operationHash,
        productID: resolved.preview.product.id,
      }),
      title:
        `Добавить «${resolved.preview.category.title}» товару «${resolved.preview.product.title}»`.slice(
          0,
          120,
        ),
    };
  }

  try {
    return await withPayloadTransaction(input.req, async () => {
      const operation = await repository.createOperation(planned);
      await audit.createEvent({
        actor: input.userID,
        dataOperationID: String(operation.id),
        idempotencyKey: `preview:${operation.id}`,
        payload: {
          categoryID: planned.categoryID,
          expectedTargetUpdatedAt: planned.expectedTargetUpdatedAt,
          operationHash: planned.operationHash,
          kind: planned.kind ?? "catalog.assignCategory.v1",
          ...(input.source.type === "workflow"
            ? { workflow: { ...input.source, requestHash } }
            : {}),
          productID: planned.productID,
        },
        toState: "awaiting_approval",
        type: "preview_created",
      });
      return operation;
    });
  } catch (error) {
    const concurrent = await findExisting();
    if (concurrent) return await assertReplay(concurrent);
    throw error;
  }
};
