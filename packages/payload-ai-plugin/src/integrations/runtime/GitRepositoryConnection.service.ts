/**
 * @file packages/payload-ai-plugin/src/integrations/runtime/GitRepositoryConnection.service.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Получает из реестра актуальное HTTPS/SSH-подключение для серверного Git-исполнителя.
 */

import {
  decryptIntegrationCredential,
  IntegrationVaultError,
} from "../credentialVault";
import { PRIMARY_GITHUB_CONNECTION_KEY } from "../providers";
import { IntegrationRuntimeError } from "./IntegrationRuntime.error";
import type {
  GitHubIntegrationReader,
  GitRepositoryConnectionResolver,
  RuntimeGitRepositoryConnection,
} from "./IntegrationRuntime.types";
import { validateRuntimeGitHubConfiguration } from "./validateRuntimeGitHubConfiguration.validator";

/** Не кэширует запись; SSH не читает vault и не получает API token. */
export class GitRepositoryConnectionService implements GitRepositoryConnectionResolver {
  constructor(
    private readonly repository: GitHubIntegrationReader,
    private readonly encryptionKey: string | undefined,
  ) {}

  async resolvePrimaryGitRepository(): Promise<RuntimeGitRepositoryConnection> {
    const integration = validateRuntimeGitHubConfiguration(
      await this.repository.readPrimaryGitHub(),
    );
    if (integration.state !== "ready") return integration;
    const details = {
      connectionKey: PRIMARY_GITHUB_CONNECTION_KEY,
      repositorySlug: integration.repositorySlug,
      repositoryURL: integration.repositoryURL,
      revision: integration.revision,
      state: "ready",
    } as const;
    if (integration.transport === "ssh") {
      return {
        ...details,
        transport: "ssh",
        sshProfileRef: integration.sshProfileRef,
      };
    }
    if (
      !integration.credentialEnvelope ||
      typeof integration.credentialEnvelope !== "string"
    ) {
      throw new IntegrationRuntimeError(
        "HTTPS Git integration has no credential.",
      );
    }
    try {
      const token = decryptIntegrationCredential({
        binding: {
          connectionKey: PRIMARY_GITHUB_CONNECTION_KEY,
          provider: "github",
        },
        encryptionKey: this.encryptionKey,
        envelope: integration.credentialEnvelope,
      });
      return { ...details, transport: "https", token };
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
