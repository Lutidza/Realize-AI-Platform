/**
 * @file tests/int/support/mediaArchitecture/createMediaArchitectureDatabase.service.ts
 * @version 1.0.0
 * @date 2026-09-14
 * @description Создаёт и удаляет только собственную одноразовую PostgreSQL-базу прототипа Media.
 * @see documentation/specifications/media-management.md
 */

import { randomBytes, randomUUID } from "node:crypto";
import { Client } from "pg";

import type { DisposableDatabase } from "./DisposableDatabase.types";
import { validateDisposableDatabase } from "./validateDisposableDatabase.validator";

/** Схема намеренно не создаётся: потребитель применяет generated Payload migration с push:false. */
export const createMediaArchitectureDatabase = async (
  workingConnectionString: string,
): Promise<DisposableDatabase> => {
  const databaseName =
    "realize_media_prototype_" + randomBytes(12).toString("hex");
  const connection = validateDisposableDatabase(
    workingConnectionString,
    databaseName,
  );
  const marker = "realize-media-prototype:" + randomUUID();
  const admin = new Client({
    connectionString: connection.maintenanceConnectionString,
    connectionTimeoutMillis: 10_000,
    query_timeout: 15_000,
    application_name: "realize-media-prototype-lifecycle",
  });
  let createdOid: number | undefined;
  let ownerOid: number | undefined;
  let isMarked = false;
  let isDisposed = false;
  let disposal: Promise<void> | undefined;
  const readIdentity = async () =>
    (
      await admin.query<{
        oid: number;
        owner_oid: number;
        marker: string | null;
      }>(
        "SELECT oid,datdba AS owner_oid,shobj_description(oid,'pg_database') AS marker FROM pg_database WHERE datname=$1",
        [databaseName],
      )
    ).rows[0];
  const dispose = async () => {
    if (isDisposed) return;
    // Повторный вызов не запускает одновременно два DROP; после отказа guard можно повторить.
    if (disposal) return disposal;
    disposal = (async () => {
      const identity = await readIdentity();
      if (!identity) {
        isDisposed = true;
        await admin.end();
        return;
      }
      validateDisposableDatabase(workingConnectionString, databaseName);
      if (
        createdOid === undefined ||
        identity.oid !== createdOid ||
        identity.owner_oid !== ownerOid ||
        (isMarked && identity.marker !== marker)
      ) {
        throw new Error("MEDIA_PROTOTYPE_DATABASE_OWNERSHIP_CONFLICT");
      }
      // Имя проверено строгим ASCII шаблоном; FORCE ограничен этой базой и её соединениями.
      await admin.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
      isDisposed = true;
      await admin.end();
    })();
    try {
      await disposal;
    } catch {
      disposal = undefined;
      throw new Error("MEDIA_PROTOTYPE_DATABASE_CLEANUP_REFUSED");
    }
  };
  try {
    await admin.connect();
    const current = (
      await admin.query<{
        database: string;
        address: string;
        owner_oid: number;
      }>(
        "SELECT current_database() AS database,host(inet_server_addr()) AS address,(SELECT oid FROM pg_roles WHERE rolname=current_user) AS owner_oid",
      )
    ).rows[0];
    if (
      current.database !== connection.maintenanceDatabaseName ||
      !["127.0.0.1", "::1"].includes(current.address)
    ) {
      throw new Error("MEDIA_PROTOTYPE_MAINTENANCE_CONNECTION_REFUSED");
    }
    ownerOid = current.owner_oid;
    await admin.query(`CREATE DATABASE "${databaseName}" TEMPLATE template0`);
    const identity = await readIdentity();
    if (!identity || identity.owner_oid !== ownerOid) {
      throw new Error("MEDIA_PROTOTYPE_DATABASE_CREATION_UNCONFIRMED");
    }
    createdOid = identity.oid;
    // Маркер состоит только из фиксированного префикса и UUID, не принимает пользовательский SQL.
    await admin.query(`COMMENT ON DATABASE "${databaseName}" IS '${marker}'`);
    isMarked = true;
    return Object.freeze({
      connectionString: connection.connectionString,
      databaseName,
      dispose,
    });
  } catch {
    if (createdOid !== undefined) {
      try {
        await dispose();
      } catch {
        await admin.end().catch(() => undefined);
        throw new Error("MEDIA_PROTOTYPE_CREATION_CLEANUP_FAILED");
      }
    } else {
      await admin.end().catch(() => undefined);
    }
    throw new Error("MEDIA_PROTOTYPE_DATABASE_CREATION_FAILED");
  }
};
