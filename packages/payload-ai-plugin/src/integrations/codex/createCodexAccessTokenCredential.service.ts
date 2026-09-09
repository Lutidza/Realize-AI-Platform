/**
 * @file packages/payload-ai-plugin/src/integrations/codex/createCodexAccessTokenCredential.service.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Проверяет Codex access token в изолированном профиле перед сохранением в vault.
 */

import { CodexAccountClient } from "@realize/codex-adapter/account";
import { createCodexAccessTokenCredential as encodeCredential } from "@realize/codex-adapter/profile";
import { EndpointError } from "../../endpoints/http";
import type { CodexCredentialMaterial } from "./CodexConnectionMutation.types";

/** Секрет передаётся штатным окружением Codex; browser не получает credential. */
export const createCodexAccessTokenCredential = async (
  accessToken: string,
): Promise<CodexCredentialMaterial> => {
  let client: CodexAccountClient | undefined;
  try {
    const authJSON = encodeCredential(accessToken);
    client = await CodexAccountClient.open({
      authMode: "accessToken",
      authJSON,
      codexBinary: process.env.REALIZE_CODEX_BINARY || undefined,
    });
    const account = await client.readAccount();
    if (account?.type !== "chatgpt") throw new Error("account_required");
    await client.checkAccountAccess();
    return {
      authJSON,
      ...(account.email ? { accountEmail: account.email } : {}),
      planType: account.planType,
    };
  } catch {
    throw new EndpointError(
      "INTEGRATION_UNAVAILABLE",
      "Не удалось подтвердить Codex access token. Проверьте токен и разрешение рабочего пространства.",
      503,
    );
  } finally {
    await client?.close().catch(() => undefined);
  }
};
