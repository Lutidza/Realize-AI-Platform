/**
 * @file tests/int/support/mediaArchitecture/prepareMediaArchitectureSchema.service.ts
 * @version 1.0.0
 * @date 2026-09-14
 * @description Запускает штатный Payload migration в дочернем процессе, сохраняя родительскую очистку базы.
 * @see documentation/specifications/media-management.md
 */

import { spawn } from "node:child_process";
import { mkdir, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { PrepareMediaArchitectureSchemaOptions } from "./PrepareMediaArchitectureSchema.types";
import { validateDisposableDatabase } from "./validateDisposableDatabase.validator";

/** Native db.migrate вызывает process.exit при ошибке; отдельный child оставляет finally владельцу fixture. */
export const prepareMediaArchitectureSchema = async (
  options: PrepareMediaArchitectureSchemaOptions,
): Promise<void> => {
  let target: URL;
  try {
    target = new URL(options.connectionString);
  } catch {
    throw new Error("MEDIA_PROTOTYPE_CONNECTION_INVALID");
  }
  const connection = validateDisposableDatabase(
    options.workingConnectionString,
    target.pathname.slice(1),
  );
  if (target.href !== connection.connectionString) {
    throw new Error("MEDIA_PROTOTYPE_MIGRATION_TARGET_REFUSED");
  }
  const storageRoot = await realpath(options.storageRoot);
  const migrationDir = path.resolve(options.migrationDir);
  const relative = path.relative(storageRoot, migrationDir);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("MEDIA_PROTOTYPE_MIGRATION_DIRECTORY_REFUSED");
  }
  await mkdir(migrationDir, { recursive: true });
  if (
    (await realpath(migrationDir)) !== migrationDir ||
    (await readdir(migrationDir)).length !== 0
  ) {
    throw new Error("MEDIA_PROTOTYPE_EMPTY_MIGRATION_DIRECTORY_REQUIRED");
  }
  const entry = fileURLToPath(
    new URL("./prepareMediaArchitectureSchema.controller.ts", import.meta.url),
  );
  await new Promise<void>((resolve, reject) => {
    let lastStage = "bootstrap";
    let failureCode: string | undefined;
    let hasFailure = false;
    const stages = new Set([
      "validating",
      "configuring",
      "initializing",
      "generating",
      "connecting",
      "migrating",
      "destroying",
      "complete",
    ]);
    const child = spawn(process.execPath, ["--import=tsx/esm", entry], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: "test",
        REALIZE_MEDIA_SCHEMA_CONNECTION: options.connectionString,
        REALIZE_MEDIA_SCHEMA_WORKING_CONNECTION:
          options.workingConnectionString,
        REALIZE_MEDIA_SCHEMA_STORAGE_ROOT: storageRoot,
        REALIZE_MEDIA_SCHEMA_MIGRATION_DIR: migrationDir,
      },
      stdio: ["ignore", "pipe", "pipe", "ipc"],
    });
    // Вывод библиотек может включать параметры подключения; он не попадает в test reporter.
    child.stdout?.resume();
    child.stderr?.resume();
    child.on("message", (message: unknown) => {
      if (
        !message ||
        typeof message !== "object" ||
        !("kind" in message) ||
        !("stage" in message) ||
        typeof message.stage !== "string" ||
        !stages.has(message.stage)
      )
        return;
      if (message.kind === "media-schema-stage" && !hasFailure)
        lastStage = message.stage;
      if (message.kind === "media-schema-failure") {
        hasFailure = true;
        lastStage = message.stage;
        if (
          "code" in message &&
          typeof message.code === "string" &&
          /^[A-Z0-9_]{1,48}$/.test(message.code)
        )
          failureCode = message.code;
      }
    });
    const timer = setTimeout(() => child.kill("SIGKILL"), 120_000);
    child.once("error", () => {
      clearTimeout(timer);
      reject(new Error("MEDIA_PROTOTYPE_MIGRATION_PROCESS_FAILED"));
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else
        reject(
          new Error(
            `MEDIA_PROTOTYPE_MIGRATION_FAILED:${lastStage}${failureCode ? ":" + failureCode : ""}`,
          ),
        );
    });
  });
  const generated = await readdir(migrationDir);
  if (
    generated.length !== 3 ||
    !generated.includes("index.ts") ||
    generated.filter((name) =>
      /^\d{8}_\d{6}_media_architecture_prototype\.ts$/.test(name),
    ).length !== 1 ||
    generated.filter((name) =>
      /^\d{8}_\d{6}_media_architecture_prototype\.json$/.test(name),
    ).length !== 1
  ) {
    throw new Error("MEDIA_PROTOTYPE_GENERATED_MIGRATION_REQUIRED");
  }
};
