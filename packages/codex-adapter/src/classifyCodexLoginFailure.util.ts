/**
 * @file packages/codex-adapter/src/classifyCodexLoginFailure.util.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Преобразует недоверенную причину отказа Codex в закрытый код без сохранения исходного текста.
 */

import type { CodexLoginFailureCode } from "./CodexLoginFailure.types";

/** Исходная ошибка может содержать URL и секреты; наружу выходит только значение из списка. */
export const classifyCodexLoginFailure = (
  error: unknown,
): CodexLoginFailureCode => {
  if (typeof error !== "string") return "provider_rejected";
  const text = error.toLowerCase();
  if (/cancelled|canceled/.test(text)) return "login_cancelled";
  if (/device.*(?:disabled|enable)|enable.*device/.test(text))
    return "device_auth_disabled";
  if (
    /workspace|organization|account.*(?:restricted|disabled|deactivated)|access_denied/.test(
      text,
    )
  )
    return "account_restricted";
  if (/expired|invalid_grant|already.*(?:used|redeemed)/.test(text))
    return "code_expired";
  if (
    /connect|dns|timed? out|timeout|tls|certificate|error sending request/.test(
      text,
    )
  )
    return "network_failed";
  if (
    /(?:persist|save|store|write).*(?:credential|auth|token)|permission denied/.test(
      text,
    )
  )
    return "credential_store_failed";
  if (/exchange|oauth|token/.test(text)) return "token_exchange_failed";
  return "provider_rejected";
};
