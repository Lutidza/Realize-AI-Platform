/**
 * @file packages/codex-adapter/src/CodexLoginFailure.types.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Перечисляет безопасные причины отказа при авторизации Codex.
 */

export type CodexLoginFailureCode =
  | "login_cancelled"
  | "device_auth_disabled"
  | "account_restricted"
  | "code_expired"
  | "network_failed"
  | "token_exchange_failed"
  | "credential_store_failed"
  | "provider_rejected";
