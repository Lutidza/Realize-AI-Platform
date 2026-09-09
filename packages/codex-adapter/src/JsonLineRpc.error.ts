/**
 * @file packages/codex-adapter/src/JsonLineRpc.error.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Безопасная ошибка транспорта Codex без исходного вывода и диагностических данных.
 */

import type { JsonLineRpcErrorCode } from "./JsonLineRpcClient.types";

/** code и message содержат только фиксированную причину; raw cause не сохраняется. */
export class JsonLineRpcError extends Error {
  readonly code: JsonLineRpcErrorCode;

  constructor(code: JsonLineRpcErrorCode) {
    super(code);
    this.name = "JsonLineRpcError";
    this.code = code;
  }
}
