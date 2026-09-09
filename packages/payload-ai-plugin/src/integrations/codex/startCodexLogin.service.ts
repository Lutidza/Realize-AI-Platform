/**
 * @file packages/payload-ai-plugin/src/integrations/codex/startCodexLogin.service.ts
 * @version 1.1.0
 * @date 2026-09-09
 * @description Проверяет хранилище и ревизию перед началом отдельного входа ChatGPT.
 */

import type { StartCodexLoginInput } from "@realize/ai-contracts";
import type { PayloadRequest } from "payload";
import { EndpointError } from "../../endpoints/http";
import { integrationVaultError } from "../../endpoints/integrationHandlerSupport";
import { IntegrationRepository } from "../../endpoints/integrationRepository";
import type { SanitizedRealizeAIPluginOptions } from "../../types";
import { isIntegrationVaultConfigured } from "../credentialVault";
import { PRIMARY_CODEX_CONNECTION_KEY } from "../providers";
import type { CodexLoginOwner } from "./CodexLoginSession.types";
import { getCodexLoginSessions } from "./getCodexLoginSessions.service";
import { acquireCodexBrowserLoginLock } from "./CodexBrowserLoginLock.adapter";
import { codexPayloadPool } from "./codexPayloadDatabase.adapter";

export const startCodexLogin = async (
  req: PayloadRequest,
  options: SanitizedRealizeAIPluginOptions,
  owner: CodexLoginOwner,
  input: StartCodexLoginInput,
  idempotencyKey: string,
) => {
  if (!isIntegrationVaultConfigured(options.integrations.encryptionKeyEnv))
    throw integrationVaultError();
  const existing = await new IntegrationRepository(
    req.payload,
    req,
  ).getByConnectionKey(PRIMARY_CODEX_CONNECTION_KEY);
  if ((existing ? Number(existing.revision) : 0) !== input.expectedRevision)
    throw new EndpointError(
      "CONFLICT",
      "Настройки Codex изменились. Обновите страницу перед входом.",
      409,
    );
  return await getCodexLoginSessions().start(owner, input, idempotencyKey, {
    acquireBrowserLock: () =>
      acquireCodexBrowserLoginLock(codexPayloadPool(req)),
  });
};
