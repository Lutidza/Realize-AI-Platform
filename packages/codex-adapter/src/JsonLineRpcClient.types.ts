/**
 * @file packages/codex-adapter/src/JsonLineRpcClient.types.ts
 * @version 2.3.0
 * @date 2026-10-04
 * @description Контракты ограниченного транспорта Codex App Server и его безопасных ошибок.
 */

import type { CodexRepositorySearchSettings } from "@realize/ai-contracts";
import type { RPCMessage } from "./protocol";

/** Настройки доверенного запуска; args заменяет полный список аргументов процесса. */
export type JsonLineRPCClientOptions = {
  /** Product runtime получает policy сервера; engineering/Git sessions не используют этот режим. */
  ignoreProjectInstructions?: boolean;
  codexBinary?: string;
  args?: readonly string[];
  /** Явный override штатного web_search; без настройки веб-поиск отключён. */
  webSearch?: "disabled" | "live";
  search?: CodexRepositorySearchSettings;
  /** Только loopback URL server-owned reader; credential хранится в приватном env процесса. */
  repositoryMcpURL?: string;
  /** Явное окружение профиля интеграции с абсолютным CODEX_HOME. */
  environment: NodeJS.ProcessEnv;
  workingDirectory: string;
  signal?: AbortSignal;
  /** Только item/tool/call; другие server requests и ошибки обработчика завершают run как нарушение. */
  onRequest?: (method: string, params: unknown) => Promise<unknown>;
  /** Синхронная server-owned привязка native child до следующего RPC request в том же chunk. */
  onNotification?: (message: RPCMessage) => void;
};

/** Закрытый список причин без вывода сервера, аргументов и системных сообщений. */
export type JsonLineRpcErrorCode =
  | "codex_configuration_invalid"
  | "codex_not_started"
  | "codex_already_started"
  | "codex_closed"
  | "codex_aborted"
  | "codex_spawn_failed"
  | "codex_process_exited"
  | "codex_transport_failed"
  | "codex_request_timeout"
  | "codex_request_failed"
  | "codex_protocol_invalid"
  | "codex_output_limit"
  | "codex_input_invalid"
  | "codex_input_limit";

export type PendingRpcRequest = {
  reject: (reason: Error) => void;
  resolve: (value: unknown) => void;
  timeout: NodeJS.Timeout;
};
