/**
 * @file packages/payload-ai-plugin/src/integrations/runtime/IntegrationRuntime.repository.ts
 * @version 1.2.0
 * @date 2026-09-09
 * @description Читает runtime интеграции и сохраняет обновлённую авторизацию Codex в PostgreSQL.
 */

import {
  PRIMARY_CODEX_CONNECTION_KEY,
  PRIMARY_GITHUB_CONNECTION_KEY,
} from "../providers";
import type {
  GitHubIntegrationReader,
  GitHubIntegrationRow,
  IntegrationRegistryDatabase,
  IntegrationRuntimeRow,
} from "./IntegrationRuntime.types";

/** Каждый вызов читает БД заново; жизненным циклом подключения управляет вызывающий процесс. */
export class IntegrationRuntimeRepository implements GitHubIntegrationReader {
  constructor(private readonly database: IntegrationRegistryDatabase) {}

  async readPrimaryGitHub(): Promise<GitHubIntegrationRow | undefined> {
    return this.readConnection(PRIMARY_GITHUB_CONNECTION_KEY);
  }

  async readPrimaryCodex(): Promise<IntegrationRuntimeRow | undefined> {
    return this.readConnection(PRIMARY_CODEX_CONNECTION_KEY);
  }

  /** Lock/unlock вызываются только на одном выделенном PoolClient, не через Pool.query. */
  async tryLockCodex(): Promise<boolean> {
    try {
      const result = await this.database.query<{ locked: boolean }>(
        "SELECT pg_try_advisory_lock(hashtext('realize:codex:primary')) AS locked",
      );
      return result.rows[0]?.locked === true;
    } catch {
      throw new Error("Codex integration registry is unavailable.");
    }
  }

  async unlockCodex(): Promise<void> {
    try {
      await this.database.query(
        "SELECT pg_advisory_unlock(hashtext('realize:codex:primary'))",
      );
    } catch {
      throw new Error("Codex integration registry is unavailable.");
    }
  }

  /** Отдельная session lock защищает loopback listener browser login между репликами CMS. */
  async tryLockCodexBrowserLogin(): Promise<boolean> {
    try {
      const result = await this.database.query<{ locked: boolean }>(
        "SELECT pg_try_advisory_lock(hashtext('realize:codex:browser-login:1455')) AS locked",
      );
      return result.rows[0]?.locked === true;
    } catch {
      throw new Error("Codex browser login registry is unavailable.");
    }
  }

  async unlockCodexBrowserLogin(): Promise<void> {
    try {
      await this.database.query(
        "SELECT pg_advisory_unlock(hashtext('realize:codex:browser-login:1455'))",
      );
    } catch {
      throw new Error("Codex browser login registry is unavailable.");
    }
  }

  /** CAS не восстанавливает credential после изменения настроек или удаления подключения. */
  async replaceCodexCredential(input: {
    revision: number;
    previousEnvelope: string;
    credentialEnvelope: string;
  }): Promise<boolean> {
    try {
      const result = await this.database.query(
        `UPDATE realize_ai_integrations
         SET credential_envelope = $1, revision = revision + 1, updated_at = NOW()
         WHERE connection_key = $2 AND provider = 'codex'
           AND revision = $3 AND credential_envelope = $4`,
        [
          input.credentialEnvelope,
          PRIMARY_CODEX_CONNECTION_KEY,
          input.revision,
          input.previousEnvelope,
        ],
      );
      return result.rowCount === 1;
    } catch {
      throw new Error(
        "Codex integration credential refresh could not be saved.",
      );
    }
  }

  private async readConnection(
    connectionKey: string,
  ): Promise<IntegrationRuntimeRow | undefined> {
    try {
      const result = await this.database.query<GitHubIntegrationRow>(
        `SELECT provider, connection_key, enabled, configuration, credential_envelope, revision
         FROM realize_ai_integrations
        WHERE connection_key = $1
        LIMIT 1`,
        [connectionKey],
      );
      return result.rows[0];
    } catch {
      // Ошибка допускает повтор; сообщение и cause драйвера могут содержать секреты.
      throw new Error("Integration registry is unavailable.");
    }
  }
}
