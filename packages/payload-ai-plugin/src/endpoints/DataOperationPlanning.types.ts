/**
 * @file packages/payload-ai-plugin/src/endpoints/DataOperationPlanning.types.ts
 * @version 1.1.0
 * @date 2026-09-11
 * @description Задаёт серверный источник типизированного Data Operation preview.
 */
import type { DataOperationIntent } from "@realize/ai-contracts";
import type { Payload, PayloadRequest } from "payload";

/** Workflow provenance не принимается из публичного Data Operation API. */
export type DataOperationPlanSource =
  | { type: "assistant"; idempotencyKey: string }
  | {
      type: "workflow";
      rootRunID: string;
      stepKey: string;
      compiledContextHash: string;
      capabilityBindingKey: string;
    };

export type TypedDataOperationPlanInput = {
  conversationID: string;
  intent: DataOperationIntent;
  payload: Payload;
  req: PayloadRequest;
  sourceMessageID: string;
  source: DataOperationPlanSource;
  userID: number | string;
};
