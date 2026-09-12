/**
 * @file packages/payload-ai-plugin/src/integrations/codex/disconnectCodexIntegration.service.ts
 * @version 1.2.0
 * @date 2026-09-11
 * @description Отключает Codex и удаляет credential, сохраняя настройки чата и ревизию.
 */

import {
  parseCodexIntegrationConfiguration,
  type DisconnectIntegrationDTO,
} from "@realize/ai-contracts";
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

/** Настройки чата переживают отключение; vault-запись удаляется без обращения к CLI. */
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
      const previous = toCodexIntegrationDTO(existing);
      if (previous.revision !== operation.input.expectedRevision)
        throw new EndpointError(
          "CONFLICT",
          "Настройки Codex изменились. Обновите страницу перед отключением.",
          409,
        );
      await repository.save({
        actorID: operation.actorID,
        category: "ai",
        configuration: parseCodexIntegrationConfiguration({
          authMode: previous.configuration.authMode,
          ...(previous.configuration.loginMethod
            ? { loginMethod: previous.configuration.loginMethod }
            : {}),
          chat: previous.configuration.chat,
          agent: previous.configuration.agent,
        }),
        connectionKey: PRIMARY_CODEX_CONNECTION_KEY,
        credentialEnvelope: null,
        credentialUpdatedAt: null,
        displayName: previous.displayName,
        enabled: false,
        existing,
        lastTestStatus: "never",
        provider: "codex",
        revision: operation.input.expectedRevision + 1,
      });
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
