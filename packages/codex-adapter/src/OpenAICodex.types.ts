/**
 * @file packages/codex-adapter/src/OpenAICodex.types.ts
 * @version 2.0.0
 * @date 2026-09-11
 * @description Задаёт серверные параметры и состояние активного запуска Codex App Server.
 */

import type { JsonLineRPCClient } from "./JsonLineRpcClient.adapter";

/** Проверенный сервером путь штатного image input App Server. */
export type CodexLocalImageInput = { type: "localImage"; path: string };

export type ActiveRun = {
  client: JsonLineRPCClient;
  threadID: string;
  turnID: string;
};

/** Окружение процесса и сигнал отмены остаются за границей browser и публичного API. */
export type OpenAICodexAdapterOptions = {
  codexBinary?: string;
  /** Явное окружение профиля интеграции с абсолютным CODEX_HOME. */
  environment: NodeJS.ProcessEnv;
  /** Каталоги приватного server storage; не принимаются из browser или run DTO. */
  privateReadDenyPaths?: readonly string[];
  signal?: AbortSignal;
};

/** Отдельная named policy чата без наследования широкого read-only профиля. */
export type CodexChatPermissions = {
  binaryPath: string;
  profile: {
    filesystem: Record<string, "read" | "deny">;
    network: { enabled: false };
  };
};
