/**
 * @file packages/payload-ai-plugin/src/integrations/runtime/IntegrationRuntime.repository.ts
 * @version 1.0.0
 * @date 2026-09-08
 * @description Читает основную запись GitHub из реестра интеграций PostgreSQL.
 */

import { PRIMARY_GITHUB_CONNECTION_KEY } from "../providers";
import type {
  GitHubIntegrationReader,
  GitHubIntegrationRow,
  IntegrationRegistryDatabase,
} from "./IntegrationRuntime.types";

/** Каждый вызов читает БД заново; жизненным циклом подключения управляет вызывающий процесс. */
export class IntegrationRuntimeRepository implements GitHubIntegrationReader {
  constructor(private readonly database: IntegrationRegistryDatabase) {}

  async readPrimaryGitHub(): Promise<GitHubIntegrationRow | undefined> {
    try {
      const result = await this.database.query<GitHubIntegrationRow>(
        `SELECT provider, connection_key, enabled, configuration, credential_envelope, revision
         FROM realize_ai_integrations
        WHERE connection_key = $1
        LIMIT 1`,
        [PRIMARY_GITHUB_CONNECTION_KEY],
      );
      return result.rows[0];
    } catch {
      // Ошибка допускает повтор; сообщение и cause драйвера могут содержать секреты.
      throw new Error("Integration registry is unavailable.");
    }
  }
}
