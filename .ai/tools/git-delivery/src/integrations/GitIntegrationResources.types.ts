/**
 * @file .ai/tools/git-delivery/src/integrations/GitIntegrationResources.types.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Определяет ресурсы общего серверного реестра для операций Git.
 */

import type { IntegrationRuntimeRepository } from "@realize/payload-ai-control/server/integration-runtime";

/** Секреты и файловые настройки доступны только серверным адаптерам. */
export type GitIntegrationResources = {
  repository: IntegrationRuntimeRepository;
  encryptionKey: string | undefined;
  sshProfilesPath: string | undefined;
  close(): Promise<void>;
};
