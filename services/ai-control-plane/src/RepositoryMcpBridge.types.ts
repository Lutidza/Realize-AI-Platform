/**
 * @file services/ai-control-plane/src/RepositoryMcpBridge.types.ts
 * @version 1.0.0
 * @date 2026-09-30
 * @description Задаёт приватный lifecycle MCP-чтения одного run, без сериализации credential.
 */
export type RepositoryMcpBridge = {
  url: string;
  /** Credential передаётся только в окружение native процесса, вне prompts и DTO. */
  environment: Record<"REALIZE_CODEX_REPO_BRIDGE_AUTH", string>;
  close: () => Promise<void>;
};
