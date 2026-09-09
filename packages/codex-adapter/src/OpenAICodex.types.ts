/**
 * @file packages/codex-adapter/src/OpenAICodex.types.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Задаёт серверные параметры и состояние активного запуска Codex App Server.
 */

import type { JsonLineRPCClient } from "./JsonLineRpcClient.adapter";

export type ActiveRun = {
  client: JsonLineRPCClient;
  threadID: string;
  turnID: string;
};

/** Окружение процесса и сигнал отмены остаются за границей browser и публичного API. */
export type OpenAICodexAdapterOptions = {
  codexBinary?: string;
  environment?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
};
