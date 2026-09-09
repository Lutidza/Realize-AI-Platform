/**
 * @file packages/payload-ai-plugin/src/integrations/codex/createCodexAPIKeyCredential.service.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Получает штатный credential cache Codex для переданного API key без запуска модели.
 */

import { CodexAccountClient } from "@realize/codex-adapter/account";
import { EndpointError } from "../../endpoints/http";

export const createCodexAPIKeyCredential = async (
  apiKey: string,
): Promise<string> => {
  let client: CodexAccountClient | undefined;
  try {
    client = await CodexAccountClient.open({
      authMode: "apiKey",
      codexBinary: process.env.REALIZE_CODEX_BINARY || undefined,
    });
    await client.loginWithAPIKey(apiKey);
    return await client.readCredential();
  } catch {
    throw new EndpointError(
      "INTEGRATION_UNAVAILABLE",
      "Не удалось сохранить API key в профиле Codex. Проверьте установку CLI на сервере.",
      503,
    );
  } finally {
    await client?.close();
  }
};
