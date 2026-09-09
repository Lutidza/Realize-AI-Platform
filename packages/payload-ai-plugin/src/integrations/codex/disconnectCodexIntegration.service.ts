/**
 * @file packages/payload-ai-plugin/src/integrations/codex/disconnectCodexIntegration.service.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Удаляет подключение Codex и credential с optimistic revision и безопасным audit.
 */

import type { DisconnectIntegrationDTO } from "@realize/ai-contracts";
import type { PayloadRequest } from "payload";
import { hashCanonicalJSON } from "@realize/change-engine";
import { EndpointError } from "../../endpoints/http";
import {
  requireMatchingIntegrationReplay,
  runIntegrationTransaction,
} from "../../endpoints/integrationHandlerSupport";
import { IntegrationRepository } from "../../endpoints/integrationRepository";
import { toCodexIntegrationDTO } from "../../endpoints/integrationMappers";
import { PRIMARY_CODEX_CONNECTION_KEY } from "../providers";
import type { DisconnectCodexMutationInput } from "./CodexConnectionMutation.types";
import { withCodexMutationLock } from "./withCodexMutationLock.service";

/** Удаление vault-записи не обращается к глобальному профилю пользователя. */
export const disconnectCodexIntegration = async (
  req: PayloadRequest,
  operation: DisconnectCodexMutationInput,
): Promise<DisconnectIntegrationDTO> => {
  const repository = new IntegrationRepository(req.payload, req);
  const requestHash = hashCanonicalJSON(operation.input);
  await withCodexMutationLock(req, () =>
    runIntegrationTransaction(req, async () => {
      const replay = await repository.findEvent(operation.idempotencyKey);
      if (replay) {
        requireMatchingIntegrationReplay(
          replay,
          "disconnected",
          operation.actorID,
          "codex",
          requestHash,
        );
        return;
      }
      const existing = await repository.getByConnectionKey(
        PRIMARY_CODEX_CONNECTION_KEY,
      );
      if (!existing)
        throw new EndpointError(
          "NOT_FOUND",
          "Подключение Codex не настроено.",
          404,
        );
      if (
        toCodexIntegrationDTO(existing).revision !==
        operation.input.expectedRevision
      )
        throw new EndpointError(
          "CONFLICT",
          "Настройки Codex изменились. Обновите страницу перед отключением.",
          409,
        );
      await repository.disconnect(existing, operation.input.expectedRevision);
      await repository.recordEvent({
        action: "disconnected",
        actorID: operation.actorID,
        connectionKey: PRIMARY_CODEX_CONNECTION_KEY,
        provider: "codex",
        idempotencyKey: operation.idempotencyKey,
        metadata: { revision: operation.input.expectedRevision, requestHash },
        status: "passed",
        summary: "Подключение Codex отключено.",
      });
    }),
  );
  return { disconnected: true, provider: "codex" };
};
