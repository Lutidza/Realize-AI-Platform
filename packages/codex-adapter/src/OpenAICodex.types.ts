/**
 * @file packages/codex-adapter/src/OpenAICodex.types.ts
 * @version 2.4.0
 * @date 2026-10-23
 * @description Задаёт серверные параметры и состояние активного запуска Codex App Server.
 */

import type {
  AgentReadTools,
  CodexRepositorySearchSettings,
} from "@realize/ai-contracts";
import type { JsonLineRPCClient } from "./JsonLineRpcClient.adapter";

/** Проверенный сервером путь штатного image input App Server. */
export type CodexLocalImageInput = { type: "localImage"; path: string };

export type ActiveRun = {
  client: JsonLineRPCClient;
  threadID: string;
  turnID: string;
  ownerHost?: boolean;
  cancelled?: boolean;
};

/** Допуск передаёт только сервер после проверки подписанного owner/run/config grant. */
export type CodexOwnerHostOptions = {
  workspaceRoot: string;
  osUser: string;
  /** Приватный материализованный контекст вложений одного run вне checkout. */
  attachmentRoot?: string;
  /** Явный серверный допуск только к MCP из .codex доверенного workspaceRoot. */
  trustedProjectMcp?: true;
};

/** Окружение процесса и сигнал отмены остаются за границей browser и публичного API. */
export type OpenAICodexAdapterOptions = {
  codexBinary?: string;
  /** Явное окружение профиля интеграции с абсолютным CODEX_HOME. */
  environment: NodeJS.ProcessEnv;
  /** Отдельный допуск к реальному checkout и машине непривилегированного владельца. */
  ownerHost?: CodexOwnerHostOptions;
  /** Каталоги приватного server storage; не принимаются из browser или run DTO. */
  privateReadDenyPaths?: readonly string[];
  /** Server-owned callback; разрешён только для analysis-readonly с новым thread. */
  readTools?: AgentReadTools;
  search?: CodexRepositorySearchSettings;
  /** MCP изолированного поиска предоставляет server-owned actual-files reader. */
  repositoryMcpURL?: string;
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
