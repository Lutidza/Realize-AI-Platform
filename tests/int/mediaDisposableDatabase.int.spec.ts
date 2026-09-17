// @vitest-environment node

/**
 * @file tests/int/mediaDisposableDatabase.int.spec.ts
 * @version 1.0.0
 * @date 2026-09-14
 * @description Проверяет отказ опасных адресов и реальное владение одноразовой базой Media.
 * @see documentation/specifications/media-management.md
 */

import { Client, Pool } from "pg";
import { describe, expect, it } from "vitest";

import {
  createMediaArchitecturePool,
  closeMediaArchitecturePool,
} from "./support/mediaArchitecture/createMediaArchitecturePool.adapter";
import { createMediaArchitectureDatabase } from "./support/mediaArchitecture/createMediaArchitectureDatabase.service";
import { validateDisposableDatabase } from "./support/mediaArchitecture/validateDisposableDatabase.validator";

const TARGET = "realize_media_prototype_0123456789abcdef01234567";
const LOCAL = "postgres://fixture:example-password@127.0.0.1:55432/working";

describe("Media disposable database boundary", () => {
  it("refuses a pool not created by the prototype adapter", async () => {
    const pool = new Pool();
    try {
      await expect(closeMediaArchitecturePool(pool)).rejects.toThrow(
        "MEDIA_PROTOTYPE_UNOWNED_POOL_REFUSED",
      );
    } finally {
      await pool.end();
    }
  });
  it("keeps the maintenance connection separate and targets the same local cluster", () => {
    const result = validateDisposableDatabase(LOCAL, TARGET);
    expect(new URL(result.connectionString).pathname).toBe("/" + TARGET);
    expect(new URL(result.maintenanceConnectionString).pathname).toBe(
      "/postgres",
    );
    expect(new URL(result.connectionString).host).toBe("127.0.0.1:55432");
    expect(result.workingDatabaseName).toBe("working");
    expect(
      validateDisposableDatabase(LOCAL.replace("/working", "/postgres"), TARGET)
        .maintenanceDatabaseName,
    ).toBe("template1");
  });

  it.each([
    "postgres://fixture:example-password@remote.test/working",
    "postgres://fixture:example-password@127.0.0.2/working",
    LOCAL + "?host=remote.test",
    LOCAL + "?hostaddr=198.51.100.1",
    LOCAL + "?database=postgres",
    LOCAL + "?service=remote",
    LOCAL + "#ignored-fragment",
    "invalid connection example",
  ])(
    "refuses an unsafe connection before creating a database",
    (connection) => {
      expect(() => validateDisposableDatabase(connection, TARGET)).toThrow(
        /^MEDIA_PROTOTYPE_/,
      );
    },
  );

  it.each([
    "working",
    "postgres",
    "realize_media_prototype_existing",
    TARGET + '";--',
  ])("refuses a database outside the generated-name boundary", (name) => {
    expect(() => validateDisposableDatabase(LOCAL, name)).toThrow(
      "MEDIA_PROTOTYPE_DATABASE_NAME_INVALID",
    );
  });

  it("refuses the working database even when it already has the test prefix", () => {
    expect(() =>
      validateDisposableDatabase(
        LOCAL.replace("/working", "/" + TARGET),
        TARGET,
      ),
    ).toThrow("MEDIA_PROTOTYPE_WORKING_DATABASE_FORBIDDEN");
  });

  it("never includes connection credentials in validation errors", () => {
    try {
      validateDisposableDatabase(
        "postgres://fixture:private-test-value@remote.test/working",
        TARGET,
      );
      throw new Error("EXPECTED_REFUSAL");
    } catch (error) {
      expect(String(error)).not.toContain("private-test-value");
    }
  });
});

/** Создание/drop запускаются отдельно по явному opt-in; обычный suite остаётся без DB mutations. */
describe.runIf(process.env.REALIZE_MEDIA_DATABASE_TESTS === "1")(
  "Media disposable database lifecycle",
  () => {
    it("refuses changed ownership, then removes exactly its restored own database", async () => {
      const working = process.env.DATABASE_URI || process.env.DATABASE_URL;
      if (!working)
        throw new Error("MEDIA_PROTOTYPE_LOCAL_CONNECTION_REQUIRED");
      const fixture = await createMediaArchitectureDatabase(working);
      const target = validateDisposableDatabase(working, fixture.databaseName);
      const admin = new Client({
        connectionString: target.maintenanceConnectionString,
      });
      const disposable = new Client({
        connectionString: fixture.connectionString,
      });
      let marker: string | undefined;
      let isMarkerChanged = false;
      try {
        await admin.connect();
        await disposable.connect();
        expect(
          (await disposable.query("SELECT current_database() AS name")).rows[0]
            .name,
        ).toBe(fixture.databaseName);
        expect(
          (
            await disposable.query(
              "SELECT count(*)::int count FROM pg_tables WHERE schemaname='public'",
            )
          ).rows[0].count,
        ).toBe(0);
        const PrototypePool = createMediaArchitecturePool();
        const pool = new PrototypePool({
          connectionString: fixture.connectionString,
          max: 2,
        });
        try {
          // Воспроизводим retained startup lease штатного db-postgres connector.
          await pool.connect();
          await pool.query("SELECT 1");
          expect(pool.totalCount).toBe(2);
          await closeMediaArchitecturePool(pool);
          await closeMediaArchitecturePool(pool);
          expect(pool.totalCount).toBe(0);
        } finally {
          await closeMediaArchitecturePool(pool);
        }
        const row = (
          await admin.query(
            "SELECT shobj_description(oid,'pg_database') AS marker FROM pg_database WHERE datname=$1",
            [fixture.databaseName],
          )
        ).rows[0];
        marker = row.marker;
        expect(marker).toMatch(/^realize-media-prototype:[a-f0-9-]+$/);
        await admin.query(
          `COMMENT ON DATABASE "${fixture.databaseName}" IS 'ownership-changed-by-own-test'`,
        );
        isMarkerChanged = true;
        await expect(fixture.dispose()).rejects.toThrow(
          "MEDIA_PROTOTYPE_DATABASE_CLEANUP_REFUSED",
        );
        expect(
          (
            await admin.query(
              "SELECT count(*)::int count FROM pg_database WHERE datname=$1",
              [fixture.databaseName],
            )
          ).rows[0].count,
        ).toBe(1);
      } finally {
        await disposable.end();
        if (isMarkerChanged && marker) {
          await admin.query(
            `COMMENT ON DATABASE "${fixture.databaseName}" IS '${marker.replaceAll("'", "''")}'`,
          );
        }
        await fixture.dispose();
        await fixture.dispose();
        expect(
          (
            await admin.query(
              "SELECT count(*)::int count FROM pg_database WHERE datname=$1",
              [fixture.databaseName],
            )
          ).rows[0].count,
        ).toBe(0);
        expect(
          (
            await admin.query(
              "SELECT count(*)::int count FROM pg_database WHERE datname=$1",
              [target.workingDatabaseName],
            )
          ).rows[0].count,
        ).toBe(1);
        await admin.end();
      }
    }, 30_000);
  },
);
