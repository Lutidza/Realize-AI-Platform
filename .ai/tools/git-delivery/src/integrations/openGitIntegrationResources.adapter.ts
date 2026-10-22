/**
 * @file .ai/tools/git-delivery/src/integrations/openGitIntegrationResources.adapter.ts
 * @version 1.0.1
 * @date 2026-10-22
 * @description Открывает общий реестр интеграций с локальными настройками среды и ограниченным Pool.
 */
import { PolicyError } from "@realize/git-runtime";

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse } from "dotenv";
import { Pool } from "pg";
import { IntegrationRuntimeRepository } from "@realize/payload-ai-control/server/integration-runtime";

import type { GitIntegrationResources } from "./GitIntegrationResources.types.ts";

/** Вызывающий адаптер закрывает Pool; чтение среды не изменяет process.env. */
export async function openGitIntegrationResources(
  repositoryRoot: string,
): Promise<GitIntegrationResources> {
  const environment: Record<string, string | undefined> = { ...process.env };
  for (const name of [".env.local", ".env"]) {
    try {
      const content = await readFile(join(repositoryRoot, name), "utf8");
      if (Buffer.byteLength(content) > 1024 * 1024) {
        throw new PolicyError(
          "connection_configuration_invalid",
          "Файл среды превышает допустимый размер.",
        );
      }
      for (const [key, value] of Object.entries(parse(content)))
        environment[key] ??= value;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  const connectionString = environment.DATABASE_URI || environment.DATABASE_URL;
  if (!connectionString)
    throw new PolicyError(
      "connection_configuration_required",
      "Не настроено подключение к БД интеграций.",
    );
  const pool = new Pool({
    connectionString,
    max: 1,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 1000,
    statement_timeout: 5000,
  });
  // Ошибка простаивающего соединения не должна раскрыть сообщение драйвера через process stderr.
  pool.on("error", () => {});
  return {
    repository: new IntegrationRuntimeRepository(pool),
    encryptionKey: environment.REALIZE_INTEGRATIONS_ENCRYPTION_KEY,
    sshProfilesPath: environment.REALIZE_GIT_SSH_PROFILES_FILE,
    close: () => pool.end(),
  };
}
