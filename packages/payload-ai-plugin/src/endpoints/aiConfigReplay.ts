/**
 * @file packages/payload-ai-plugin/src/endpoints/aiConfigReplay.ts
 * @version 1.0.1
 * @date 2026-10-12
 * @description Обеспечивает actor/action/hash-bound durable replay config mutations.
 * @docref Realize — AI Platform v1.0 — API и streaming contracts
 * @see documentation/specifications/realize-ai-commerce/v1.0/03-runtime-delivery-and-security/22-api-and-streaming-contracts.md
 */

import type { PayloadRequest } from "payload";

import {
  type AIConfigEventAction,
  AIConfigRepository,
} from "./aiConfigRepository";
import { EndpointError } from "./http";
import { relationID } from "./mappers";
import { withPayloadTransaction } from "./payloadTransaction";
import { lockAIConfigMutation } from "./lockAIConfigMutation.util";

type ReplayScope<T> = {
  action: AIConfigEventAction;
  actorID: number | string;
  parse: (value: unknown) => T;
  requestHash: string;
  resourceID: string;
  resourceKind: "draft" | "release";
};

const replayFrom = <T>(
  event: Record<string, unknown>,
  scope: ReplayScope<T>,
): T => {
  if (
    event.action !== scope.action ||
    relationID(event.actor) !== String(scope.actorID) ||
    event.requestHash !== scope.requestHash ||
    event.resourceID !== scope.resourceID ||
    event.resourceKind !== scope.resourceKind
  ) {
    throw new EndpointError(
      "CONFLICT",
      "Idempotency-Key was already used for another AI configuration operation.",
      409,
    );
  }
  return scope.parse(event.responseSnapshot);
};

const findReplay = async <T>(
  repository: AIConfigRepository,
  idempotencyKey: string,
  scope: ReplayScope<T>,
): Promise<T | undefined> => {
  const event = await repository.findEvent(idempotencyKey);
  return event ? replayFrom(event, scope) : undefined;
};

/** Runs one mutation atomically and recovers a concurrently committed replay. */
export const withAIConfigMutationReplay = async <T>(input: {
  idempotencyKey: string;
  operation: () => Promise<T>;
  repository: AIConfigRepository;
  req: PayloadRequest;
  scope: ReplayScope<T>;
}): Promise<T> => {
  const replay = await findReplay(
    input.repository,
    input.idempotencyKey,
    input.scope,
  );
  if (replay !== undefined) return replay;

  try {
    return await withPayloadTransaction(input.req, async () => {
      await lockAIConfigMutation(input.req);
      const concurrentReplay = await findReplay(
        input.repository,
        input.idempotencyKey,
        input.scope,
      );
      return concurrentReplay !== undefined
        ? concurrentReplay
        : await input.operation();
    });
  } catch (error) {
    const committedReplay = await findReplay(
      input.repository,
      input.idempotencyKey,
      input.scope,
    );
    if (committedReplay !== undefined) return committedReplay;
    throw error;
  }
};
