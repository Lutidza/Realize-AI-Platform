/**
 * @file .ai/tools/git-delivery/src/integrations/GitIntegrationResources.types.ts
 * @version 1.1.0
 * @date 2026-11-08
 * @description Определяет ресурсы общего серверного реестра для операций Git.
 */

import type {
  CodexConnectionResolver,
  IntegrationRuntimeRepository,
} from "@realize/payload-ai-control/server/integration-runtime";

/** Секреты и файловые настройки доступны только серверным адаптерам. */
export type GitIntegrationResources = {
  repository: IntegrationRuntimeRepository;
  codex: CodexConnectionResolver;
  encryptionKey: string | undefined;
  sshProfilesPath: string | undefined;
  close(): Promise<void>;
};
