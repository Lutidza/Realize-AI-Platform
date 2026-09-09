/**
 * @file packages/codex-adapter/src/validateNativeCodexAuth.validator.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Проверяет ограниченный native auth JSON и выбранный метод авторизации Codex.
 */

import { CodexProfileError } from "./CodexProfile.error";
import type { CodexAuthMode } from "./CodexProfile.types";

/** Возвращает canonical JSON без интерпретации JWT и без раскрытия ошибок парсера. */
export const validateNativeCodexAuth = (
  authJSON: string,
  authMode: CodexAuthMode,
): string => {
  try {
    if (Buffer.byteLength(authJSON, "utf8") > 65_536) throw new Error();
    const source: unknown = JSON.parse(authJSON);
    if (!source || typeof source !== "object" || Array.isArray(source))
      throw new Error();
    const auth = source as Record<string, unknown>;
    const nonempty = (value: unknown): value is string =>
      typeof value === "string" &&
      value.trim().length > 0 &&
      !value.includes("\0");
    if (authMode === "apiKey") {
      if (
        !nonempty(auth.OPENAI_API_KEY) ||
        (auth.auth_mode != null && auth.auth_mode !== "apikey") ||
        auth.tokens != null
      )
        throw new Error();
    } else if (authMode === "chatgpt") {
      if (
        auth.OPENAI_API_KEY != null ||
        (auth.auth_mode != null && auth.auth_mode !== "chatgpt") ||
        !auth.tokens ||
        typeof auth.tokens !== "object" ||
        Array.isArray(auth.tokens)
      )
        throw new Error();
      const tokens = auth.tokens as Record<string, unknown>;
      if (
        !nonempty(tokens.access_token) ||
        !nonempty(tokens.refresh_token) ||
        !nonempty(tokens.id_token) ||
        (tokens.account_id != null && !nonempty(tokens.account_id))
      )
        throw new Error();
    } else throw new Error();
    return JSON.stringify(source);
  } catch {
    throw new CodexProfileError();
  }
};
