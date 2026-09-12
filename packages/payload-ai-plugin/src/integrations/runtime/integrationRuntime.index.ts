/**
 * @file packages/payload-ai-plugin/src/integrations/runtime/integrationRuntime.index.ts
 * @version 1.4.0
 * @date 2026-09-11
 * @description Объявляет публичные серверные экспорты модуля разрешения интеграций.
 */

export { GitHubConnectionService } from "./GitHubConnection.service";
export { GitRepositoryConnectionService } from "./GitRepositoryConnection.service";
export { GitCommitAuthorService } from "./GitCommitAuthor.service";
export type {
  GitCommitAuthorResolver,
  RuntimeGitCommitAuthor,
} from "./GitCommitAuthor.types";
export { IntegrationRuntimeError } from "./IntegrationRuntime.error";
export { IntegrationRuntimeRepository } from "./IntegrationRuntime.repository";
export { CodexConnectionService } from "../codex/runtime/CodexConnection.service";
export { acquireCodexConnectionLock } from "../codex/runtime/CodexConnectionLock.adapter";
export { CodexConnectionError } from "../codex/runtime/CodexConnection.error";
export { readCodexStateRoot } from "../codex/runtime/readCodexStateRoot.config";
export type {
  CodexConnectionLease,
  CodexConnectionLock,
  CodexConnectionOptions,
  CodexConnectionResolver,
} from "../codex/runtime/CodexConnection.types";
export type {
  GitHubConnectionResolver,
  GitHubIntegrationReader,
  GitRepositoryConnectionResolver,
  RuntimeGitHubIntegration,
  RuntimeGitRepositoryConnection,
} from "./IntegrationRuntime.types";

export {
  WorkerPresenceRepository,
  WORKER_HEARTBEAT_INTERVAL_MS,
  WORKER_HEARTBEAT_STALE_MS,
} from "./WorkerPresence.repository";
export type {
  WorkerCapabilities,
  WorkerPresenceState,
  WorkerPresenceUpdate,
} from "./WorkerPresence.types";
