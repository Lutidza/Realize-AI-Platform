// @vitest-environment node

/**
 * @file tests/int/migration-adoption.int.spec.ts
 * @version 2026-08-28
 * @description Проверяет semantic schema comparison и fail-closed migration adoption.
 */

import { describe, expect, it } from "vitest";

import {
  planMigrationHistory,
  readExpectedMigrationNames,
} from "../../scripts/migrations/migration-history.mjs";
import {
  canonicalizeSchemaSnapshot,
  compareSchemaSnapshots,
} from "../../scripts/migrations/schema-evidence.mjs";
import { databaseUserFromUrl } from "../../scripts/migrations/postgres-runtime.mjs";

const expectedMigrations = [
  "20260817_124443_baseline_core_schema",
  "20260817_124449_realize_ai_readonly",
  "20260817_135658_conversation_idempotency",
  "20260818_170919_approval_only_change_requests",
  "20260821_194623_isolated_execution_worker",
  "20260821_205949_local_preview_promotion",
  "20260822_092506_release_candidate_approval",
  "20260827_070003_admin_integration_registry",
  "20260828_022809_github_pull_request_source_promotion",
  "20260828_044410_data_operation_lane",
];

describe("migration adoption evidence", () => {
  it("reads every versioned migration in canonical index order", () => {
    expect(readExpectedMigrationNames()).toEqual(expectedMigrations);
  });

  it("keeps probe ownership with the target application role", () => {
    expect(
      databaseUserFromUrl(
        "postgres://realize%2Dapp:example-password@127.0.0.1:5432/realize",
      ),
    ).toBe("realize-app");
  });

  it("ignores physical catalog row order while preserving schema meaning", () => {
    const left = {
      columns: [
        { column_name: "title", table_name: "pages" },
        { column_name: "id", table_name: "pages" },
      ],
      enums: [{ labels: ["draft", "published"], type_name: "status" }],
    };
    const right = {
      enums: [{ type_name: "status", labels: ["draft", "published"] }],
      columns: [
        { table_name: "pages", column_name: "id" },
        { table_name: "pages", column_name: "title" },
      ],
    };

    expect(canonicalizeSchemaSnapshot(left)).toEqual(
      canonicalizeSchemaSnapshot(right),
    );
    expect(compareSchemaSnapshots(left, right)).toMatchObject({ equal: true });
  });

  it("treats enum label order as schema semantics", () => {
    const comparison = compareSchemaSnapshots(
      { enums: [{ labels: ["draft", "published"], type_name: "status" }] },
      { enums: [{ labels: ["published", "draft"], type_name: "status" }] },
    );

    expect(comparison.equal).toBe(false);
    expect(comparison.differences[0]).toMatchObject({ category: "enums" });
  });

  it("accepts only one dev marker or complete named history", () => {
    expect(
      planMigrationHistory([{ batch: -1, name: "dev" }], expectedMigrations),
    ).toEqual({ state: "adopt" });
    expect(
      planMigrationHistory(
        expectedMigrations.map((name, index) => ({
          batch: index === 2 ? 2 : 1,
          name,
        })),
        expectedMigrations,
      ),
    ).toEqual({ state: "already-adopted" });
  });

  it("rejects partial and mixed history without guessing", () => {
    expect(() =>
      planMigrationHistory(
        [
          { batch: -1, name: "dev" },
          { batch: 1, name: expectedMigrations[0] },
        ],
        expectedMigrations,
      ),
    ).toThrow("Unsafe migration history state");
    expect(() => planMigrationHistory([], expectedMigrations)).toThrow(
      "Unsafe migration history state",
    );
  });
});
