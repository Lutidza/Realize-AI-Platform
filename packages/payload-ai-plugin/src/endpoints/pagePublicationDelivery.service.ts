/**
 * @file packages/payload-ai-plugin/src/endpoints/pagePublicationDelivery.service.ts
 * @version 2.0.0
 * @date 2026-09-14
 * @description Доставляет обновление витрины отдельно от атомарной записи публикации и проецирует безопасный статус.
 * @see documentation/specifications/realize-ai-commerce/v1.0/02-change-engine-and-pipelines/14-data-config-pipeline.md
 */
import {
  parseIdentifier,
  parseApplyDataOperationInput,
  type PagePublicationDeliveryDTO,
} from "@realize/ai-contracts";
import { hashCanonicalJSON } from "@realize/change-engine";
import type { PayloadRequest } from "payload";
import { REALIZE_AI_SERVER_RUNTIME_KEY } from "../constants";
import type { RealizeAIServerRuntime } from "../types";
import { DataOperationAuditRepository } from "./dataOperationAuditRepository";
import { DataOperationRepository } from "./dataOperationRepository";
import { EndpointError } from "./http";
import { relationID } from "./mappers";
import {
  isPagePublicationKind,
  requirePagePublicationAccess,
} from "./pagePublicationAccess.service";
import { readPagePublicationSnapshot } from "./pagePublicationSnapshot.mapper";
import {
  PAGE_PUBLICATION_DELIVERY_ERROR,
  PagePublicationDeliveryRepository,
} from "./pagePublicationDelivery.repository";
import type { AIDocument } from "./repository";
import type { PagePublicationDeliveryPayload } from "./PagePublicationDelivery.types";

const conflict = () =>
  new EndpointError(
    "CONFLICT",
    "Публикация или событие обновления витрины изменились. Обновите карточку операции.",
    409,
  );
const operationID = (operation: AIDocument) =>
  parseIdentifier(relationID(operation.id), "publication operation id");

/** История доступна владельцу с правом чата даже после отзыва права изменять страницы. */
const requireDeliveryReadAccess = async (
  req: PayloadRequest,
): Promise<void> => {
  if (!req.user)
    throw new EndpointError("UNAUTHENTICATED", "Войдите в админку.", 401);
  const runtime = req.payload.config.custom?.[REALIZE_AI_SERVER_RUNTIME_KEY] as
    RealizeAIServerRuntime | undefined;
  if (!(await runtime?.canUseChat?.({ req })))
    throw new EndpointError(
      "FORBIDDEN",
      "Недостаточно прав для просмотра операции.",
      403,
    );
};

/** Payload выводится из подписанного immutable snapshot; адреса браузера не принимаются. */
const deliveryPayload = (
  operation: AIDocument,
): PagePublicationDeliveryPayload => {
  if (!isPagePublicationKind(operation.kind) || operation.state !== "applied")
    throw conflict();
  const snapshot = readPagePublicationSnapshot(operation);
  const binding = parseApplyDataOperationInput({
    expectedVersion: operation.version,
    expectedOperationHash: operation.operationHash,
  });
  const oldSlug = snapshot.beforePage.slug;
  const emptyUnpublishedSlug =
    snapshot.beforePage._status !== "published" &&
    (oldSlug == null || oldSlug === "");
  const slugs = emptyUnpublishedSlug
    ? [snapshot.targetPage.slug]
    : [oldSlug, snapshot.targetPage.slug];
  if (
    slugs.some(
      (slug) =>
        typeof slug !== "string" ||
        !slug ||
        slug.length > 160 ||
        /[\\/?#\u0000-\u0020\u007f]/u.test(slug),
    )
  )
    throw conflict();
  return {
    version: "1.0",
    operationHash: binding.expectedOperationHash,
    operationVersion: binding.expectedVersion,
    pageID: snapshot.preview.page.id,
    slugs: [...new Set(slugs as string[])],
  };
};

const assertEvent = (
  event: AIDocument | undefined,
  payload: PagePublicationDeliveryPayload,
): AIDocument => {
  if (
    !event ||
    !event.payload ||
    typeof event.payload !== "object" ||
    Array.isArray(event.payload) ||
    Buffer.byteLength(JSON.stringify(event.payload), "utf8") > 2048 ||
    hashCanonicalJSON(event.payload) !== hashCanonicalJSON(payload) ||
    !["pending", "delivered", "failed"].includes(String(event.deliveryStatus))
  )
    throw conflict();
  return event;
};

/** Вызывается внутри внешней transaction после applied transition и наследует её rollback. */
export const createPagePublicationDelivery = async (
  req: PayloadRequest,
  operation: AIDocument,
): Promise<void> => {
  await requirePagePublicationAccess(req);
  if ((await req.transactionID) == null)
    throw new EndpointError(
      "CONFLICT",
      "Событие обновления витрины создаётся вместе с публикацией.",
      409,
    );
  const id = operationID(operation);
  const payload = deliveryPayload(operation);
  const existing = await new PagePublicationDeliveryRepository(req).find(id);
  if (existing) {
    assertEvent(existing, payload);
    return;
  }
  await new DataOperationAuditRepository(req.payload, req).createEvent({
    actor: req.user!.id,
    dataOperationID: id,
    idempotencyKey: `publication-delivery:${id}`,
    payload,
    toState: "applied",
    type: "publication_delivery_requested",
  });
};

/** Чтение закрытого события сохраняет политику истории: право чата и владение диалогом. */
export const getPagePublicationDelivery = async (
  req: PayloadRequest,
  id: string,
): Promise<PagePublicationDeliveryDTO> => {
  await requireDeliveryReadAccess(req);
  const operation = await new DataOperationRepository(
    req.payload,
    req,
  ).getOwnedOperation(
    parseIdentifier(id, "publication operation id"),
    String(req.user!.id),
  );
  const payload = deliveryPayload(operation);
  const event = assertEvent(
    await new PagePublicationDeliveryRepository(req).find(id),
    payload,
  );
  if (event.deliveryStatus === "failed")
    return { status: "failed", message: PAGE_PUBLICATION_DELIVERY_ERROR };
  if (event.deliveryStatus === "pending") return { status: "pending" };
  const deliveredAt = event.deliveredAt;
  if (
    typeof deliveredAt !== "string" ||
    !Number.isFinite(Date.parse(deliveredAt)) ||
    new Date(deliveredAt).toISOString() !== deliveredAt
  )
    throw conflict();
  return { status: "succeeded", deliveredAt };
};

/** Retry повторяет только cache invalidation; запись Pages и payload события не затрагиваются. */
export const deliverPagePublication = async (
  req: PayloadRequest,
  operation: AIDocument,
): Promise<void> => {
  const adapter = await requirePagePublicationAccess(req);
  if ((await req.transactionID) != null)
    throw new EndpointError(
      "CONFLICT",
      "Обновление витрины возможно только после сохранения операции.",
      409,
    );
  const id = operationID(operation);
  const owned = await new DataOperationRepository(
    req.payload,
    req,
  ).getOwnedOperation(id, String(req.user!.id));
  if (
    owned.version !== operation.version ||
    owned.operationHash !== operation.operationHash ||
    owned.kind !== operation.kind ||
    owned.state !== operation.state
  )
    throw conflict();
  const payload = deliveryPayload(owned);
  const repository = new PagePublicationDeliveryRepository(req);
  const event = assertEvent(await repository.find(id), payload);
  if (event.deliveryStatus === "delivered") return;
  let status: "delivered" | "failed" = "delivered";
  try {
    await adapter.revalidate([...payload.slugs], req);
  } catch {
    status = "failed";
  }
  await repository.complete(
    id,
    parseIdentifier(relationID(event.id), "delivery event id"),
    hashCanonicalJSON(payload),
    status,
  );
};
