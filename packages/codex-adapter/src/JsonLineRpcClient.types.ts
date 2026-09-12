/**
 * @file packages/codex-adapter/src/JsonLineRpcClient.types.ts
 * @version 2.0.0
 * @date 2026-09-11
 * @description Контракты ограниченного транспорта Codex App Server и его безопасных ошибок.
 */

/** Настройки доверенного запуска; args заменяет полный список аргументов процесса. */
export type JsonLineRPCClientOptions = {
  codexBinary?: string;
  args?: readonly string[];
  /** Явный override штатного web_search; без настройки веб-поиск отключён. */
  webSearch?: "disabled" | "live";
  /** Явное окружение профиля интеграции с абсолютным CODEX_HOME. */
  environment: NodeJS.ProcessEnv;
  workingDirectory: string;
  signal?: AbortSignal;
  onRequest?: (method: string, params: unknown) => Promise<unknown>;
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
