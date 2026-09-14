/**
 * @file packages/payload-ai-plugin/src/endpoints/PagePublicationDelivery.types.ts
 * @version 1.0.0
 * @date 2026-09-14
 * @description Закрытый неизменяемый payload и persistence контракт доставки публикации.
 */
import type { AIDocument } from "./repository";

export type PagePublicationDeliveryPayload = {
  version: "1.0";
  operationHash: string;
  operationVersion: number;
  pageID: string;
  slugs: string[];
};
export type PagePublicationDeliveryOutcome = "delivered" | "failed";
export type PagePublicationDeliveryLocalAPI = {
  find: (args: Record<string, unknown>) => Promise<{ docs: AIDocument[] }>;
  update: (args: Record<string, unknown>) => Promise<AIDocument>;
};
