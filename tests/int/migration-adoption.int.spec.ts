// @vitest-environment node

/**
 * @file tests/int/migration-adoption.int.spec.ts
 * @version 1.1.3
 * @date 2026-10-13
 * @description Проверяет semantic schema comparison и fail-closed migration adoption.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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
  "20260901_163832_ai_config_persistence",
  "20260909_190959_chat_message_context",
  "20260910_122259_ai_config_activation",
  "20260911_132139_worker_presence",
  "20260911_155718_page_draft_data_operation",
  "20260912_111003_page_draft_update",
  "20260913_184706_page_structure_draft_operation",
  "20260914_083749_page_publication_operations",
  "20260915_080818_media_processing_profiles",
  "20260915_082031_media_nullable_backlinks",
  "20260923_120805_internal_mcp",
  "20260925_093817_chatgpt_tunnel_status",
  "20260925_133735_design_workshop",
  "20260925_170325_design_preview",
  "20260926_112722_workshop_mcp",
  "20260927_070914_search_observations",
  "20260928_102009_search_observation_state",
  "20261004_161914_ai_execution_context",
  "20261004_210727_ai_usage_ledger",
  "20261011_162630_task_manager_foundation",
  "20261011_215235_task_git_sync",
  "20261012_094626_extension_manager_state",
];

describe("migration adoption evidence", () => {
  it("reads every versioned migration in canonical index order", () => {
    expect(readExpectedMigrationNames()).toEqual(expectedMigrations);
  });

  it("drops config lock relations before their referenced tables", () => {
    const source = readFileSync(
      resolve(
        process.cwd(),
        "src/migrations/20260901_163832_ai_config_persistence.ts",
      ),
      "utf8",
    );
    const down = source.slice(source.indexOf("export async function down"));
    expect(down.indexOf("DROP CONSTRAINT")).toBeGreaterThan(-1);
    expect(down.indexOf("DROP CONSTRAINT")).toBeLessThan(
      down.indexOf('DROP TABLE "realize_ai_config_drafts"'),
    );
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
