/**
 * @file packages/payload-ai-plugin/src/integrations/codex/saveCodexIntegration.service.ts
 * @version 1.1.0
 * @date 2026-09-09
 * @description Сохраняет настройки Codex, передавая write-only секреты серверному auth adapter.
 */

import type { PayloadRequest } from "payload";
import type { SanitizedRealizeAIPluginOptions } from "../../types";
import { EndpointError } from "../../endpoints/http";
import type { PersistCodexConnectionInput } from "./CodexConnectionMutation.types";
import { createCodexAPIKeyCredential } from "./createCodexAPIKeyCredential.service";
import { createCodexAccessTokenCredential } from "./createCodexAccessTokenCredential.service";
import { persistCodexConnection } from "./persistCodexConnection.service";

/** Сохранённый ключ переиспользуется только при неизменном режиме авторизации. */
export const saveCodexIntegration = async (
  req: PayloadRequest,
  options: SanitizedRealizeAIPluginOptions,
  operation: Omit<PersistCodexConnectionInput, "credential">,
) =>
  persistCodexConnection(req, options, {
    ...operation,
    ...(operation.input.accessToken
      ? {
          credential: () =>
            createCodexAccessTokenCredential(operation.input.accessToken!),
        }
      : {}),
    ...(operation.input.apiKey
      ? {
          credential: async () => {
            try {
              return {
                authJSON: await createCodexAPIKeyCredential(
                  operation.input.apiKey!,
                ),
              };
            } catch {
              throw new EndpointError(
                "INTEGRATION_UNAVAILABLE",
                "Не удалось подготовить подключение Codex через API key.",
                503,
              );
            }
          },
        }
      : {}),
  });
