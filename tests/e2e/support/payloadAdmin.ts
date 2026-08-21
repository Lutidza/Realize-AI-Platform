/**
 * @file tests/e2e/support/payloadAdmin.ts
 * @version 2026-08-18
 * @description Provisions and removes an exact temporary Payload admin for browser tests.
 */

import { randomUUID } from "node:crypto";

import type { APIRequestContext } from "@playwright/test";
import { Client } from "pg";

/** Credentials and identity of one disposable browser-test administrator. */
export type PayloadAdminFixture = {
  email: string;
  id: number;
  password: string;
};

const databaseConnectionString = (): string => {
  const value = process.env.DATABASE_URI || process.env.DATABASE_URL;
  if (!value) throw new Error("DATABASE_URI or DATABASE_URL is required.");
  return value;
};

/** Runs a scoped test operation against the configured Payload database. */
export const withPayloadTestDatabase = async <T>(
  operation: (database: Client) => Promise<T>,
): Promise<T> => {
  const database = new Client({ connectionString: databaseConnectionString() });
  await database.connect();
  try {
    return await operation(database);
  } finally {
    await database.end();
  }
};

/** Creates a user through Payload and grants only that exact user the admin role. */
export const provisionPayloadAdmin = async (
  request: APIRequestContext,
): Promise<PayloadAdminFixture> => {
  const nonce = randomUUID();
  const email = `admin-ai-${nonce}@example.test`;
  const password = `E2e-${nonce}-Aa1!`;
  const response = await request.post("/api/users", {
    data: { email, name: "Admin AI E2E", password },
  });
  if (!response.ok()) {
    throw new Error(`Payload user creation failed with ${response.status()}.`);
  }

  const payload = (await response.json()) as { doc?: { id?: number } };
  const id = Number(payload.doc?.id);
  if (!Number.isInteger(id)) {
    throw new Error("Payload user creation returned no numeric user id.");
  }

  await withPayloadTestDatabase(async (database) => {
    await database.query("BEGIN");
    try {
      await database.query('DELETE FROM "users_roles" WHERE "parent_id" = $1', [
        id,
      ]);
      await database.query(
        'INSERT INTO "users_roles" ("order", "parent_id", "value") VALUES (1, $1, \'admin\')',
        [id],
      );
      await database.query("COMMIT");
    } catch (cause) {
      await database.query("ROLLBACK");
      await database.query(
        'DELETE FROM "users" WHERE "id" = $1 AND "email" = $2',
        [id, email],
      );
      throw cause;
    }
  });

  return { email, id, password };
};

/** Removes only the user created by the matching browser-test fixture. */
export const removePayloadAdmin = async (
  fixture: PayloadAdminFixture,
): Promise<void> => {
  await withPayloadTestDatabase(async (database) => {
    await database.query(
      'DELETE FROM "users" WHERE "id" = $1 AND "email" = $2',
      [fixture.id, fixture.email],
    );
  });
};
