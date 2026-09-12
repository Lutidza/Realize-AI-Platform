/**
 * @file packages/payload-ai-plugin/src/integrations/codex/saveCodexAgentSettings.service.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Сохраняет настройки агента с ревизией и audit независимо от наличия авторизации Codex.
 */

import {
  parseCodexIntegrationConfiguration,
  type CodexIntegrationConnectionDTO,
  type SaveCodexAgentSettingsInput,
} from "@realize/ai-contracts";
import { hashCanonicalJSON } from "@realize/change-engine";
import type { PayloadRequest } from "payload";
import { EndpointError } from "../../endpoints/http";
import {
  requireMatchingIntegrationReplay,
  runIntegrationTransaction,
} from "../../endpoints/integrationHandlerSupport";
import { toCodexIntegrationDTO } from "../../endpoints/integrationMappers";
import { IntegrationRepository } from "../../endpoints/integrationRepository";
import { PRIMARY_CODEX_CONNECTION_KEY } from "../providers";
import type { CodexMutationInput } from "./CodexConnectionMutation.types";
import { withCodexMutationLock } from "./withCodexMutationLock.service";

/** Не требует CLI/vault; включение без credential сохраняется, но runtime остаётся недоступным. */
export const saveCodexAgentSettings = async (
  req: PayloadRequest,
  operation: CodexMutationInput<SaveCodexAgentSettingsInput>,
): Promise<CodexIntegrationConnectionDTO> => {
  const repository = new IntegrationRepository(req.payload, req);
  const requestHash = hashCanonicalJSON({
    operation: "agent-settings",
    ...operation.input,
  });
  return withCodexMutationLock(req, () =>
    runIntegrationTransaction(req, async () => {
      const replay = await repository.findEvent(operation.idempotencyKey);
      const existing = await repository.getByConnectionKey(
        PRIMARY_CODEX_CONNECTION_KEY,
      );
      const previous = existing ? toCodexIntegrationDTO(existing) : undefined;
      if (replay) {
        requireMatchingIntegrationReplay(
          replay,
          "saved",
          operation.actorID,
          "codex",
          requestHash,
        );
        if (!previous)
          throw new EndpointError(
            "CONFLICT",
            "Настройки Codex больше не существуют.",
            409,
          );
        return previous;
      }
      if ((previous?.revision ?? 0) !== operation.input.expectedRevision)
        throw new EndpointError(
          "CONFLICT",
          "Настройки Codex изменились. Обновите страницу перед сохранением.",
          409,
        );
      const configuration = parseCodexIntegrationConfiguration({
        ...(previous?.configuration ?? {
          authMode: "chatgpt",
          loginMethod: "browser",
        }),
        agent: operation.input.settings,
      });
      const revision = operation.input.expectedRevision + 1;
      const saved = await repository.save({
        actorID: operation.actorID,
        category: "ai",
        configuration,
        connectionKey: PRIMARY_CODEX_CONNECTION_KEY,
        credentialEnvelope:
          typeof existing?.credentialEnvelope === "string"
            ? existing.credentialEnvelope
            : null,
        credentialUpdatedAt: previous?.credentialUpdatedAt ?? null,
        displayName: previous?.displayName ?? "Основной Codex",
        enabled: operation.input.enabled,
        existing,
        lastTestStatus: previous?.lastTestStatus ?? "never",
        provider: "codex",
        revision,
      });
      await repository.recordEvent({
        action: "saved",
        actorID: operation.actorID,
        connectionKey: PRIMARY_CODEX_CONNECTION_KEY,
        idempotencyKey: operation.idempotencyKey,
        metadata: {
          operation: "agent-settings",
          revision,
          settings: operation.input.settings,
          enabled: operation.input.enabled,
          requestHash,
        },
        provider: "codex",
        status: "passed",
        summary: "Настройки агента Codex сохранены.",
      });
      return toCodexIntegrationDTO(saved);
    }),
  );
};
