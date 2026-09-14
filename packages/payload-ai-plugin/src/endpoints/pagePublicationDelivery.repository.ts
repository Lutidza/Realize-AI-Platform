/**
 * @file packages/payload-ai-plugin/src/endpoints/pagePublicationDelivery.repository.ts
 * @version 1.0.0
 * @date 2026-09-14
 * @description Читает outbox и сохраняет только delivery metadata с терминальным delivered.
 * @see documentation/specifications/realize-ai-commerce/v1.0/02-change-engine-and-pipelines/14-data-config-pipeline.md
 */
import { hashCanonicalJSON } from "@realize/change-engine";
import type { PayloadRequest } from "payload";
import { DATA_OPERATION_EVENTS_SLUG } from "../constants";
import { EndpointError } from "./http";
import { relationID } from "./mappers";
import { lockAITransaction } from "./lockAITransaction.util";
import { withPayloadTransaction } from "./payloadTransaction";
import type { AIDocument } from "./repository";
import type {
  PagePublicationDeliveryLocalAPI,
  PagePublicationDeliveryOutcome,
} from "./PagePublicationDelivery.types";

export const PAGE_PUBLICATION_DELIVERY_ERROR =
  "Не удалось обновить витрину. Повторите обновление; страница уже сохранена.";
const unavailable = () =>
  new EndpointError(
    "CONFLICT",
    "Событие обновления витрины недоступно или изменилось.",
    409,
  );

/** Только metadata изменяема; event payload, actor и idempotency key остаются неизменными. */
export class PagePublicationDeliveryRepository {
  private readonly api: PagePublicationDeliveryLocalAPI;
  constructor(private readonly req: PayloadRequest) {
    this.api = req.payload as unknown as PagePublicationDeliveryLocalAPI;
  }

  async find(operationID: string): Promise<AIDocument | undefined> {
    const result = await this.api.find({
      collection: DATA_OPERATION_EVENTS_SLUG,
      depth: 0,
      limit: 2,
      pagination: false,
      overrideAccess: true,
      req: this.req,
      where: {
        and: [
          { dataOperation: { equals: this.documentID(operationID) } },
          { idempotencyKey: { equals: `publication-delivery:${operationID}` } },
          { type: { equals: "publication_delivery_requested" } },
        ],
      },
    });
    if (result.docs.length > 1) throw unavailable();
    const event = result.docs[0];
    if (
      event &&
      (relationID(event.dataOperation) !== operationID ||
        event.idempotencyKey !== `publication-delivery:${operationID}` ||
        event.type !== "publication_delivery_requested" ||
        event.toState !== "applied")
    )
      throw unavailable();
    return event;
  }

  /** Короткая transaction начинается только после внешнего cache effect; Pages lock сериализует metadata writers. */
  async complete(
    operationID: string,
    eventID: string,
    payloadHash: string,
    status: PagePublicationDeliveryOutcome,
  ): Promise<void> {
    if ((await this.req.transactionID) != null) throw unavailable();
    await withPayloadTransaction(this.req, async () => {
      await lockAITransaction(this.req, "page-drafts");
      const event = await this.find(operationID);
      if (
        !event ||
        relationID(event.id) !== eventID ||
        hashCanonicalJSON(event.payload) !== payloadHash ||
        !["pending", "failed", "delivered"].includes(
          String(event.deliveryStatus),
        )
      )
        throw unavailable();
      // Более поздний failure не может отменить уже сохранённый успех другого запроса.
      if (event.deliveryStatus === "delivered") return;
      const saved = await this.api.update({
        collection: DATA_OPERATION_EVENTS_SLUG,
        id: this.documentID(eventID),
        depth: 0,
        overrideAccess: true,
        req: this.req,
        data: {
          deliveryStatus: status,
          deliveryError:
            status === "failed" ? PAGE_PUBLICATION_DELIVERY_ERROR : null,
          deliveredAt: status === "delivered" ? new Date().toISOString() : null,
        },
      });
      if (
        saved.deliveryStatus !== status ||
        hashCanonicalJSON(saved.payload) !== payloadHash
      )
        throw unavailable();
    });
  }

  private documentID(value: string): string | number {
    if (this.req.payload.db.defaultIDType === "text") return value;
    const id = Number(value);
    if (!Number.isSafeInteger(id) || id < 1)
      throw new EndpointError(
        "INVALID_REQUEST",
        "Идентификатор события или операции некорректен.",
        400,
      );
    return id;
  }
}
