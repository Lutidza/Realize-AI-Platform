/**
 * @file packages/codex-adapter/src/CodexAccessTokenCredential.adapter.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Кодирует write-only access token в серверный формат vault, отличный от native auth.json.
 * @see documentation/architecture/codex-integration.md
 */

import { CodexProfileError } from "./CodexProfile.error";

/** Создаёт только серверный plaintext для vault; результат не является файлом авторизации CLI. */
export const createCodexAccessTokenCredential = (
  accessToken: string,
): string => {
  if (
    typeof accessToken !== "string" ||
    !accessToken ||
    Buffer.byteLength(accessToken, "utf8") > 32_768 ||
    /[\s\0]/.test(accessToken)
  )
    throw new CodexProfileError();
  return JSON.stringify({ type: "codexAccessToken", accessToken });
};

/** Читает token только внутри server boundary для официального CODEX_ACCESS_TOKEN. */
export const readCodexAccessTokenCredential = (credential: string): string => {
  try {
    if (Buffer.byteLength(credential, "utf8") > 65_536) throw new Error();
    const value: unknown = JSON.parse(credential);
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error();
    const record = value as Record<string, unknown>;
    if (
      Object.keys(record).length !== 2 ||
      record.type !== "codexAccessToken" ||
      typeof record.accessToken !== "string"
    )
      throw new Error();
    createCodexAccessTokenCredential(record.accessToken);
    return record.accessToken;
  } catch {
    throw new CodexProfileError();
  }
};
