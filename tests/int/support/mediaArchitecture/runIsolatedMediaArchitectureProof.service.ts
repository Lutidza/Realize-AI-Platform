/**
 * @file tests/int/support/mediaArchitecture/runIsolatedMediaArchitectureProof.service.ts
 * @version 1.0.0
 * @date 2026-09-14
 * @description Управляет opt-in proof и гарантирует закрытие своей БД и файлов при ошибке.
 */
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getPayload, type Payload } from "payload";
import { createMediaArchitectureDatabase } from "./createMediaArchitectureDatabase.service";
import { closeMediaArchitecturePool } from "./createMediaArchitecturePool.adapter";
import { prepareMediaArchitectureSchema } from "./prepareMediaArchitectureSchema.service";
import { buildMediaArchitectureConfig } from "./mediaArchitecture.config";
import { runMediaArchitectureProof } from "./runMediaArchitectureProof.service";
import type { IsolatedMediaArchitectureOptions } from "./MediaArchitecture.types";

/** Рабочий DSN нужен только для создания отдельной БД; конфигурация приложения не загружается. */
export const runIsolatedMediaArchitectureProof = async ({
  workingConnectionString,
  artifactRoot = path.resolve(
    ".ai-workspace/tasks/media-architecture-prototype/tmp",
  ),
  beforeCleanup,
}: IsolatedMediaArchitectureOptions) => {
  await mkdir(artifactRoot, { recursive: true });
  const storageRoot = await mkdtemp(path.join(artifactRoot, "media-proof-"));
  const migrationDir = path.join(storageRoot, "migrations");
  let payload: Payload | undefined;
  let dispose: (() => Promise<void>) | undefined;
  try {
    const database = await createMediaArchitectureDatabase(
      workingConnectionString,
    );
    dispose = database.dispose;
    const options = {
      connectionString: database.connectionString,
      storageRoot,
      migrationDir,
    };
    await prepareMediaArchitectureSchema({
      ...options,
      workingConnectionString,
    });
    const config = await buildMediaArchitectureConfig(options);
    const key = `media-proof-${randomUUID()}`;
    payload = await getPayload({
      config,
      key,
      cron: false,
      disableOnInit: true,
    });
    const result = await runMediaArchitectureProof({
      payload,
      config,
      key,
      storageRoot,
    });
    await beforeCleanup?.({ payload, config, key, storageRoot, result });
    return result;
  } finally {
    try {
      const pool = payload?.db.pool;
      try {
        await payload?.destroy();
      } finally {
        if (pool) await closeMediaArchitecturePool(pool);
      }
    } finally {
      try {
        await dispose?.();
      } finally {
        await rm(storageRoot, { recursive: true, force: true });
      }
    }
  }
};
