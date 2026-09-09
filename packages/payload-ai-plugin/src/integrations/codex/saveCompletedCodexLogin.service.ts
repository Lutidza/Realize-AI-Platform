/**
 * @file packages/payload-ai-plugin/src/integrations/codex/saveCompletedCodexLogin.service.ts
 * @version 1.1.0
 * @date 2026-09-09
 * @description Завершает managed ChatGPT login сохранением credential в общем vault.
 */

import type { CodexIntegrationConnectionDTO } from "@realize/ai-contracts";
import type { PayloadRequest } from "payload";
import type { SanitizedRealizeAIPluginOptions } from "../../types";
import type { CompletedCodexLoginInput } from "./CodexConnectionMutation.types";
import { persistCodexConnection } from "./persistCodexConnection.service";

/** Вызывается серверным login manager после подтверждения аккаунта Codex. */
export const saveCompletedCodexLogin = async (
  req: PayloadRequest,
  options: SanitizedRealizeAIPluginOptions,
  operation: CompletedCodexLoginInput,
): Promise<CodexIntegrationConnectionDTO> =>
  persistCodexConnection(req, options, {
    actorID: operation.actorID,
    idempotencyKey: operation.idempotencyKey,
    input: {
      ...operation.input,
      authMode: "chatgpt",
      loginMethod: operation.input.loginMethod ?? "deviceCode",
    },
    credential: async () => ({
      authJSON: operation.authJSON,
      accountEmail: operation.accountEmail,
      planType: operation.planType,
    }),
  });
