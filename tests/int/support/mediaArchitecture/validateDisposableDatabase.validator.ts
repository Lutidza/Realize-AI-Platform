/**
 * @file tests/int/support/mediaArchitecture/validateDisposableDatabase.validator.ts
 * @version 1.0.0
 * @date 2026-09-14
 * @description Ограничивает базу прототипа Media локальным кластером и отдельным безопасным именем.
 * @see documentation/specifications/media-management.md
 */

import type { DisposableDatabaseConnection } from "./DisposableDatabase.types";

/** Не принимает переопределения host через query, рабочую базу или произвольное имя удаления. */
export const validateDisposableDatabase = (
  workingConnectionString: string,
  databaseName: string,
): DisposableDatabaseConnection => {
  let connection: URL;
  try {
    connection = new URL(workingConnectionString);
  } catch {
    throw new Error("MEDIA_PROTOTYPE_CONNECTION_INVALID");
  }
  if (
    !["postgres:", "postgresql:"].includes(connection.protocol) ||
    !["localhost", "127.0.0.1", "[::1]"].includes(connection.hostname) ||
    connection.hash ||
    [...connection.searchParams.keys()].some((key) => key !== "sslmode")
  ) {
    throw new Error("MEDIA_PROTOTYPE_LOCAL_CONNECTION_REQUIRED");
  }
  let workingDatabaseName: string;
  try {
    workingDatabaseName = decodeURIComponent(connection.pathname.slice(1));
  } catch {
    throw new Error("MEDIA_PROTOTYPE_CONNECTION_INVALID");
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(workingDatabaseName)) {
    throw new Error("MEDIA_PROTOTYPE_WORKING_DATABASE_INVALID");
  }
  if (!/^realize_media_prototype_[a-f0-9]{24}$/.test(databaseName)) {
    throw new Error("MEDIA_PROTOTYPE_DATABASE_NAME_INVALID");
  }
  if (databaseName === workingDatabaseName) {
    throw new Error("MEDIA_PROTOTYPE_WORKING_DATABASE_FORBIDDEN");
  }
  const maintenanceDatabaseName =
    workingDatabaseName === "postgres" ? "template1" : "postgres";
  const maintenance = new URL(connection);
  maintenance.pathname = "/" + maintenanceDatabaseName;
  connection.pathname = "/" + databaseName;
  return {
    connectionString: connection.href,
    databaseName,
    maintenanceConnectionString: maintenance.href,
    maintenanceDatabaseName,
    workingDatabaseName,
  };
};
