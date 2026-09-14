/**
 * @file packages/payload-ai-plugin/src/endpoints/pagePublicationPlanning.service.ts
 * @version 2.0.0
 * @date 2026-09-14
 * @description Создаёт отдельную публикационную операцию из принадлежащего пользователю снимка с durable replay.
 */
import {
  parseApplyDataOperationInput,
  type PreparePagePublicationInput,
  type PreparePagePublicationRestoreInput,
} from "@realize/ai-contracts";
import { hashCanonicalJSON } from "@realize/change-engine";
import type { PayloadRequest } from "payload";
import { DataOperationRepository } from "./dataOperationRepository";
import { DataOperationAuditRepository } from "./dataOperationAuditRepository";
import { requirePagePublicationAccess } from "./pagePublicationAccess.service";
import { PagePublication } from "./pagePublication.service";
import { pagePublicationOperationHash } from "./pagePublicationSnapshot.mapper";
import { EndpointError } from "./http";
import { relationID } from "./mappers";
import { withPayloadTransaction } from "./payloadTransaction";
import { lockAITransaction } from "./lockAITransaction.util";
import type { AIDocument } from "./repository";

/** Повтор читает прежний результат по key/body hash даже после истечения плана; нового разрешения записи он не создаёт. */
export const preparePagePublication = async (
  req: PayloadRequest,
  sourceID: string,
  rawInput: PreparePagePublicationInput | PreparePagePublicationRestoreInput,
  mode: "publish" | "restore",
  idempotencyKey: string,
): Promise<AIDocument> => {
  await requirePagePublicationAccess(req);
  const input = parseApplyDataOperationInput(rawInput);
  const actorID = String(req.user!.id);
  const repository = new DataOperationRepository(req.payload, req);
  const audit = new DataOperationAuditRepository(req.payload, req);
  const requestHash = hashCanonicalJSON({ sourceID, input, mode, actorID });
  const replay = async () => {
    const existing = await repository.findByIdempotencyKey(
      actorID,
      idempotencyKey,
    );
    if (!existing) return undefined;
    const owned = await repository.getOwnedOperation(
      String(existing.id),
      actorID,
    );
    const event = await audit.getPreviewEvent(String(existing.id));
    if (
      (event?.payload as Record<string, unknown> | undefined)
        ?.publicationRequestHash !== requestHash
    )
      throw new EndpointError(
        "CONFLICT",
        "Этот ключ уже использован для другой операции. Обновите карточку перед повтором.",
        409,
      );
    return owned;
  };
  const existing = await replay();
  if (existing) return existing;
  return await withPayloadTransaction(req, async () => {
    await lockAITransaction(req, "page-drafts");
    const concurrent = await replay();
    if (concurrent) return concurrent;
    const source = await repository.getOwnedOperation(sourceID, actorID);
    const { snapshot, expiresAt } = await new PagePublication(
      req.payload,
      req,
    ).prepare(sourceID, input, mode);
    const operationHash = pagePublicationOperationHash(snapshot);
    const kind =
      mode === "publish"
        ? "pages.publishDraft.v1"
        : "pages.restorePublication.v1";
    const operation = await repository.createOperation({
      kind,
      riskLevel: "R2",
      rollbackStrategy: mode === "publish" ? "restore-publication" : "none",
      afterSnapshot: snapshot,
      beforeSnapshot: snapshot.beforePage,
      conversationID: relationID(source.conversation),
      sourceMessageID: relationID(source.sourceMessage),
      sourceMessageKey: `publication:${hashCanonicalJSON({ actorID, idempotencyKey })}`,
      expectedTargetUpdatedAt: String(snapshot.revision.page.updatedAt),
      expiresAt,
      idempotencyKey,
      intent: { kind, version: "1.0", sourceOperationID: sourceID },
      operationHash,
      originalRequest:
        mode === "publish"
          ? "Опубликовать проверенную версию страницы."
          : "Восстановить прежнюю публичную версию, сохранив рабочий черновик.",
      requestedBy: req.user!.id,
      rollbackHash: hashCanonicalJSON({
        kind: "pages.publication.restore-reference.v1",
        operationHash,
      }),
      title:
        `${mode === "publish" ? "Опубликовать" : "Восстановить публикацию"} «${snapshot.preview.page.title}»`.slice(
          0,
          120,
        ),
    });
    await audit.createEvent({
      actor: req.user!.id,
      dataOperationID: String(operation.id),
      idempotencyKey: `preview:${operation.id}`,
      payload: {
        kind,
        operationHash,
        publicationRequestHash: requestHash,
        sourceOperationID: sourceID,
        manifestHash: snapshot.preview.manifestHash,
      },
      toState: "awaiting_approval",
      type: "preview_created",
    });
    return operation;
  });
};
