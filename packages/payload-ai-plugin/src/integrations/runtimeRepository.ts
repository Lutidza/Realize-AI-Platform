/** Серверное чтение подключения из реестра ADR-0012 для исполнителей ADR-0013/0016. */

import {
  ContractValidationError,
  parseGitHubRepositoryURL,
} from "@realize/ai-contracts";
import {
  decryptIntegrationCredential,
  IntegrationVaultError,
} from "./credentialVault";
import type { Pool } from "pg";

import { PRIMARY_GITHUB_CONNECTION_KEY } from "./providers";

type GitHubIntegrationRow = {
  configuration: unknown;
  connection_key: string;
  credential_envelope: string | null;
  enabled: boolean;
  provider: string;
  revision: string | number;
};

export type RuntimeGitHubIntegration =
  | { state: "absent" }
  | { state: "disabled" }
  | {
      defaultBranch?: string;
      repositorySlug: string;
      revision: number;
      state: "ready";
      token: string;
    };

/** Узкий серверный контракт; token запрещено передавать модели, Admin DTO или журналу. */
export interface GitHubConnectionResolver {
  resolvePrimaryGitHub(): Promise<RuntimeGitHubIntegration>;
}

/** Ошибка сохранённой конфигурации блокирует операцию, а не запускает повтор. */
export class IntegrationRuntimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IntegrationRuntimeError";
  }
}

const configurationOf = (
  value: unknown,
): {
  defaultBranch?: string;
  repositorySlug: string;
  repositoryURL: string;
} => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new IntegrationRuntimeError(
      "Stored GitHub integration configuration is invalid.",
    );
  }
  const source = value as Record<string, unknown>;
  const normalized = parseGitHubRepositoryURL(source.repositoryURL);
  if (source.repositorySlug !== normalized.repositorySlug) {
    throw new IntegrationRuntimeError(
      "Stored GitHub repository identity is inconsistent.",
    );
  }
  const defaultBranch = source.defaultBranch;
  if (
    defaultBranch !== undefined &&
    (typeof defaultBranch !== "string" ||
      !/^(?!.*\.\.)(?!\/)(?!.*\/$)[A-Za-z0-9._/-]{1,200}$/.test(defaultBranch))
  ) {
    throw new IntegrationRuntimeError(
      "Stored GitHub default branch is invalid.",
    );
  }
  return { ...normalized, ...(defaultBranch ? { defaultBranch } : {}) };
};

/** Каждый вызов читает актуальную запись; Pool и ключ принадлежат процессу запуска. */
export class IntegrationRuntimeRepository implements GitHubConnectionResolver {
  constructor(
    private readonly pool: Pick<Pool, "query">,
    private readonly encryptionKey: string | undefined,
  ) {}

  async resolvePrimaryGitHub(): Promise<RuntimeGitHubIntegration> {
    let row: GitHubIntegrationRow | undefined;
    try {
      const result = await this.pool.query<GitHubIntegrationRow>(
        `SELECT provider, connection_key, enabled, configuration, credential_envelope, revision
         FROM realize_ai_integrations
        WHERE connection_key = $1
        LIMIT 1`,
        [PRIMARY_GITHUB_CONNECTION_KEY],
      );
      row = result.rows[0];
    } catch {
      // Сбой БД остаётся повторяемой ошибкой чтения; детали драйвера могут содержать секреты.
      throw new Error("Integration registry is unavailable.");
    }
    if (!row) return { state: "absent" };
    if (
      row.provider !== "github" ||
      row.connection_key !== PRIMARY_GITHUB_CONNECTION_KEY
    ) {
      throw new IntegrationRuntimeError(
        "Stored GitHub integration identity is invalid.",
      );
    }
    if (!row.enabled) return { state: "disabled" };
    if (!row.credential_envelope) {
      throw new IntegrationRuntimeError(
        "Enabled GitHub integration has no credential.",
      );
    }
    let configuration: ReturnType<typeof configurationOf>;
    try {
      configuration = configurationOf(row.configuration);
    } catch (error) {
      if (error instanceof ContractValidationError) {
        throw new IntegrationRuntimeError(
          "Stored GitHub integration configuration is invalid.",
        );
      }
      throw error;
    }
    const revision = Number(row.revision);
    if (!Number.isSafeInteger(revision) || revision < 1) {
      throw new IntegrationRuntimeError(
        "Stored GitHub integration revision is invalid.",
      );
    }
    try {
      const token = decryptIntegrationCredential({
        binding: {
          connectionKey: PRIMARY_GITHUB_CONNECTION_KEY,
          provider: "github",
        },
        encryptionKey: this.encryptionKey,
        envelope: row.credential_envelope,
      });
      return {
        ...(configuration.defaultBranch
          ? { defaultBranch: configuration.defaultBranch }
          : {}),
        repositorySlug: configuration.repositorySlug,
        revision,
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
