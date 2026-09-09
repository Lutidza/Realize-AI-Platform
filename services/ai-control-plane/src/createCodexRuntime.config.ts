/**
 * @file services/ai-control-plane/src/createCodexRuntime.config.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Подключает control plane к серверному resolver интеграции Codex в PostgreSQL.
 */

import { Pool } from "pg";
import { CodexConnectionService } from "@realize/payload-ai-control/server/integration-runtime";

/** Процесс владеет Pool; dispose вызывается после завершения всех активных lease. */
export const createCodexRuntime = (
  environment: NodeJS.ProcessEnv = process.env,
) => {
  const databaseURL = environment.DATABASE_URI || environment.DATABASE_URL;
  if (!databaseURL)
    throw new Error(
      "DATABASE_URI or DATABASE_URL is required for the Codex integration.",
    );
  const pool = new Pool({
    connectionString: databaseURL,
    max: 2,
    connectionTimeoutMillis: 5_000,
  });
  return {
    codex: new CodexConnectionService({
      pool,
      encryptionKey: environment.REALIZE_INTEGRATIONS_ENCRYPTION_KEY,
      sourceEnvironment: environment,
    }),
    dispose: () => pool.end(),
  };
};
