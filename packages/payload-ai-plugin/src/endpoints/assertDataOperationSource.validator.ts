/**
 * @file packages/payload-ai-plugin/src/endpoints/assertDataOperationSource.validator.ts
 * @version 1.0.0
 * @date 2026-09-12
 * @description Связывает повтор подготовки с прежним владельцем, диалогом, ответом и точным intent.
 */
import { hashCanonicalJSON } from "@realize/change-engine";
import type { TypedDataOperationPlanInput } from "./DataOperationPlanning.types";
import { EndpointError } from "./http";
import { relationID } from "./mappers";
import type { AIDocument } from "./repository";

/** Replay не перепланирует уже применённую операцию и не подставляет её другому ответу. */
export const assertDataOperationSource = (
  operation: AIDocument,
  input: Pick<
    TypedDataOperationPlanInput,
    "conversationID" | "sourceMessageID" | "userID"
  > &
    Partial<Pick<TypedDataOperationPlanInput, "intent">>,
): void => {
  if (
    relationID(operation.conversation) !== input.conversationID ||
    relationID(operation.sourceMessage) !== input.sourceMessageID ||
    relationID(operation.requestedBy) !== String(input.userID) ||
    (input.intent &&
      hashCanonicalJSON(operation.intent) !== hashCanonicalJSON(input.intent))
  )
    throw new EndpointError(
      "CONFLICT",
      "Ключ подготовки уже связан с другим диалогом, ответом или предложением изменения.",
      409,
    );
};
