/**
 * @file tests/int/support/mediaArchitecture/prepareMediaArchitectureSchema.controller.ts
 * @version 1.0.0
 * @date 2026-09-14
 * @description Генерирует и применяет native Payload migration только для дочернего процесса Media proof.
 * @see documentation/specifications/media-management.md
 */

import { randomUUID } from "node:crypto";
import { readdir, realpath } from "node:fs/promises";
import path from "node:path";
import { getPayload, type Payload } from "payload";

import { buildMediaArchitectureConfig } from "./mediaArchitecture.config";
import { closeMediaArchitecturePool } from "./createMediaArchitecturePool.adapter";
import { validateDisposableDatabase } from "./validateDisposableDatabase.validator";
import type { MediaArchitectureSchemaStage } from "./PrepareMediaArchitectureSchema.types";

let payload: Payload | undefined;
let stage: MediaArchitectureSchemaStage = "validating";
const reportStage = (value: MediaArchitectureSchemaStage) => {
  stage = value;
  process.send?.({ kind: "media-schema-stage", stage });
};
try {
  reportStage("validating");
  const connectionString = process.env.REALIZE_MEDIA_SCHEMA_CONNECTION;
  const workingConnectionString =
    process.env.REALIZE_MEDIA_SCHEMA_WORKING_CONNECTION;
  const storageRoot = process.env.REALIZE_MEDIA_SCHEMA_STORAGE_ROOT;
  const migrationDir = process.env.REALIZE_MEDIA_SCHEMA_MIGRATION_DIR;
  if (
    !connectionString ||
    !workingConnectionString ||
    !storageRoot ||
    !migrationDir
  ) {
    throw new Error("MEDIA_PROTOTYPE_SCHEMA_INPUT_REQUIRED");
  }
  // Child тоже проверяет адрес: прямой запуск entry не может использовать рабочую БД или product fallback.
  const target = new URL(connectionString);
  const validated = validateDisposableDatabase(
    workingConnectionString,
    target.pathname.slice(1),
  );
  const resolvedStorage = await realpath(storageRoot);
  const resolvedMigrations = await realpath(migrationDir);
  const relativeMigrations = path.relative(resolvedStorage, resolvedMigrations);
  if (
    target.href !== validated.connectionString ||
    !relativeMigrations ||
    relativeMigrations.startsWith("..") ||
    path.isAbsolute(relativeMigrations) ||
    (await readdir(resolvedMigrations)).length !== 0
  ) {
    throw new Error("MEDIA_PROTOTYPE_SCHEMA_BOUNDARY_REFUSED");
  }
  reportStage("configuring");
  const config = await buildMediaArchitectureConfig({
    connectionString,
    storageRoot,
    migrationDir,
  });
  reportStage("initializing");
  payload = await getPayload({
    config,
    key: "media-architecture-schema-" + randomUUID(),
    disableDBConnect: true,
    disableOnInit: true,
  });
  if (!payload.db.createMigration) {
    throw new Error("MEDIA_PROTOTYPE_MIGRATION_API_REQUIRED");
  }
  reportStage("generating");
  await payload.db.createMigration({
    payload,
    migrationName: "media_architecture_prototype",
    forceAcceptWarning: true,
    skipEmpty: false,
  });
  if (!payload.db.connect) {
    throw new Error("MEDIA_PROTOTYPE_CONNECT_API_REQUIRED");
  }
  reportStage("connecting");
  await payload.db.connect();
  reportStage("migrating");
  await payload.db.migrate();
} catch (error) {
  const code =
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof error.code === "string" &&
    /^[A-Z0-9_]{1,48}$/.test(error.code)
      ? error.code
      : undefined;
  process.send?.({ kind: "media-schema-failure", stage, code });
  process.exitCode = 1;
} finally {
  reportStage("destroying");
  try {
    await payload?.destroy();
  } catch {
    process.exitCode = 1;
  } finally {
    if (payload?.db.pool) {
      await closeMediaArchitecturePool(payload.db.pool).catch(() => {
        process.exitCode = 1;
      });
    }
  }
}
// Как native CLI, отдельный процесс закрывает оставленные SDK соединения после finally.
reportStage("complete");
process.exit(process.exitCode ?? 0);
