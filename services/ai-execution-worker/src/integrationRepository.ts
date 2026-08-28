/**
 * @file services/ai-execution-worker/src/integrationRepository.ts
 * @version 2026-08-28
 * @docref ADR-0012, ADR-0013
 * @see documentation/architecture/decisions/ADR-0012-admin-integration-registry.md
 * @see documentation/architecture/decisions/ADR-0013-github-pull-request-source-promotion.md
 * @description Resolves a revision-bound GitHub connection for worker-owned consumers.
 */

import { parseGitHubRepositoryURL } from "@realize/ai-contracts";
import {
  decryptIntegrationCredential,
  IntegrationVaultError,
} from "@realize/payload-ai-control/server/integration-vault";
import type { Pool } from "pg";

const PRIMARY_GITHUB_CONNECTION_KEY = "github:primary";

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

/** Safe configuration failure that should block rather than retry one candidate. */
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

/** Reads only the single connection needed immediately before release execution. */
export class IntegrationWorkerRepository {
  constructor(
    private readonly pool: Pool,
    private readonly encryptionKey: string | undefined,
  ) {}

  async resolvePrimaryGitHub(): Promise<RuntimeGitHubIntegration> {
    const result = await this.pool.query<GitHubIntegrationRow>(
      `SELECT provider, connection_key, enabled, configuration, credential_envelope, revision
         FROM realize_ai_integrations
        WHERE connection_key = $1
        LIMIT 1`,
      [PRIMARY_GITHUB_CONNECTION_KEY],
    );
    const row = result.rows[0];
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
    const configuration = configurationOf(row.configuration);
    const revision = Number(row.revision);
    if (!Number.isInteger(revision) || revision < 1) {
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
          "GitHub integration credential cannot be decrypted by this worker.",
        );
      }
      throw error;
    }
  }
}
