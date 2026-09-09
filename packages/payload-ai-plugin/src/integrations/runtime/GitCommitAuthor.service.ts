/**
 * @file packages/payload-ai-plugin/src/integrations/runtime/GitCommitAuthor.service.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Получает автора Git-коммита из актуальной интеграции без расшифровки credential.
 */

import { PRIMARY_GITHUB_CONNECTION_KEY } from "../providers";
import type { GitHubIntegrationReader } from "./IntegrationRuntime.types";
import type {
  GitCommitAuthorResolver,
  RuntimeGitCommitAuthor,
} from "./GitCommitAuthor.types";
import { validateRuntimeGitHubConfiguration } from "./validateRuntimeGitHubConfiguration.validator";

/** Принимает существующий reader; ключ vault и окружение сервису не нужны. */
export class GitCommitAuthorService implements GitCommitAuthorResolver {
  constructor(private readonly repository: GitHubIntegrationReader) {}

  async resolvePrimaryGitCommitAuthor(): Promise<RuntimeGitCommitAuthor> {
    const integration = validateRuntimeGitHubConfiguration(
      await this.repository.readPrimaryGitHub(),
    );
    if (integration.state !== "ready") return integration;
    if (!integration.commitAuthor) return { state: "unconfigured" };
    return {
      state: "ready",
      author: integration.commitAuthor,
      connectionKey: PRIMARY_GITHUB_CONNECTION_KEY,
      revision: integration.revision,
    };
  }
}
