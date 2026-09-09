/**
 * @file packages/payload-ai-plugin/src/integrations/runtime/GitHubConnection.service.ts
 * @version 1.0.0
 * @date 2026-09-08
 * @description Получает проверенное подключение GitHub и credential для серверного исполнителя.
 */

import {
  decryptIntegrationCredential,
  IntegrationVaultError,
} from "../credentialVault";
import { PRIMARY_GITHUB_CONNECTION_KEY } from "../providers";
import { IntegrationRuntimeError } from "./IntegrationRuntime.error";
import type {
  GitHubConnectionResolver,
  GitHubIntegrationReader,
  RuntimeGitHubIntegration,
} from "./IntegrationRuntime.types";
import { validateRuntimeGitHubIntegration } from "./validateRuntimeGitHubIntegration.validator";

/** Получает подключение без кэша; ключ передаётся процессом запуска и не попадает в результат. */
export class GitHubConnectionService implements GitHubConnectionResolver {
  constructor(
    private readonly repository: GitHubIntegrationReader,
    private readonly encryptionKey: string | undefined,
  ) {}

  async resolvePrimaryGitHub(): Promise<RuntimeGitHubIntegration> {
    const integration = validateRuntimeGitHubIntegration(
      await this.repository.readPrimaryGitHub(),
    );
    if (integration.state !== "ready") return integration;

    try {
      const token = decryptIntegrationCredential({
        binding: {
          connectionKey: PRIMARY_GITHUB_CONNECTION_KEY,
          provider: "github",
        },
        encryptionKey: this.encryptionKey,
        envelope: integration.credentialEnvelope,
      });
      return {
        ...(integration.defaultBranch
          ? { defaultBranch: integration.defaultBranch }
          : {}),
        repositorySlug: integration.repositorySlug,
        revision: integration.revision,
        state: "ready",
        token,
      };
    } catch (error) {
      if (error instanceof IntegrationVaultError) {
        throw new IntegrationRuntimeError(
          "GitHub integration credential cannot be decrypted by this executor.",
        );
      }
      throw error;
    }
  }
}
