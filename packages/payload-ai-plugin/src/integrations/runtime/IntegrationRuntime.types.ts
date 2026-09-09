/**
 * @file packages/payload-ai-plugin/src/integrations/runtime/IntegrationRuntime.types.ts
 * @version 1.1.0
 * @date 2026-09-09
 * @description Задаёт контракты чтения и серверного разрешения подключения GitHub.
 */

import type { GitHubIntegrationConfigurationDTO } from "@realize/ai-contracts";
import type { Pool } from "pg";

export type IntegrationRegistryDatabase = Pick<Pool, "query">;

// SQL возвращает непроверенную конфигурацию и revision как число или строку.
export type GitHubIntegrationRow = {
  configuration: unknown;
  connection_key: string;
  credential_envelope: string | null;
  enabled: boolean;
  provider: string;
  revision: string | number;
};

type InactiveGitHubIntegration = { state: "absent" } | { state: "disabled" };

export type ValidatedGitHubConfiguration =
  | InactiveGitHubIntegration
  | (GitHubIntegrationConfigurationDTO & {
      credentialEnvelope: string | null;
      revision: number;
      state: "ready";
    });

type GitRepositoryConnectionDetails = {
  connectionKey: "github:primary";
  repositorySlug: string;
  repositoryURL: string;
  revision: number;
  state: "ready";
};

/** Серверный транспорт; token доступен только обработчику Git, не модели или DTO. */
export type RuntimeGitRepositoryConnection =
  | InactiveGitHubIntegration
  | (GitRepositoryConnectionDetails & { transport: "https"; token: string })
  | (GitRepositoryConnectionDetails & {
      transport: "ssh";
      sshProfileRef: string;
    });

/** Читает актуальное назначение Git без запуска SSH, Git или проверки REST. */
export interface GitRepositoryConnectionResolver {
  resolvePrimaryGitRepository(): Promise<RuntimeGitRepositoryConnection>;
}

type GitHubConnectionDetails = Pick<
  GitHubIntegrationConfigurationDTO,
  "defaultBranch" | "repositorySlug"
> & {
  revision: number;
  state: "ready";
};

/** Серверный результат; token запрещено передавать модели, Admin DTO или журналу. */
export type RuntimeGitHubIntegration =
  InactiveGitHubIntegration | (GitHubConnectionDetails & { token: string });

export type ValidatedGitHubIntegration =
  | InactiveGitHubIntegration
  | (GitHubConnectionDetails & { credentialEnvelope: string });

/** Читает актуальную запись без проверки конфигурации и расшифровки credential. */
export interface GitHubIntegrationReader {
  readPrimaryGitHub(): Promise<GitHubIntegrationRow | undefined>;
}

/** Возвращает актуальное подключение для серверного исполнителя. */
export interface GitHubConnectionResolver {
  resolvePrimaryGitHub(): Promise<RuntimeGitHubIntegration>;
}
