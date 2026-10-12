/**
 * @file tests/int/extension-appearance-postgres.int.spec.ts
 * @version 1.1.0
 * @date 2026-10-12
 * @description Проверяет state/ledger, реальные Payload транзакции, CAS и durable UUID на собственной PostgreSQL fixture.
 * @see documentation/specifications/extension-management.md
 */
// @vitest-environment node
import { randomBytes, randomUUID } from "node:crypto";
import { Client } from "pg";
import { PgDialect } from "drizzle-orm/pg-core";
import { postgresAdapter, type MigrateUpArgs } from "@payloadcms/db-postgres";
import {
  buildConfig,
  createLocalReq,
  getPayload,
  initTransaction,
  killTransaction,
  type CollectionSlug,
  type Payload,
} from "payload";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { realizeTemplateManifest } from "@realize/template-realize/manifest";
import settingsSchema from "@realize/template-realize/settings.schema.json";
import { resolveRealizeSettings } from "@realize/template-realize/settings";
import type {
  ExtensionAppearancePlanDto,
  ExtensionAppearanceStore,
  PrepareExtensionAppearanceInput,
  AdminShellMode,
  AdminShellPlanDto,
  AdminShellPolicy,
} from "@realize/payload-extension-manager/contracts";
import {
  ExtensionManagerError,
  adminShellReceiptSchema,
} from "@realize/payload-extension-manager/contracts";
import {
  applyExtensionAppearance,
  createExtensionAppearanceStore,
  createExtensionCatalog,
  ExtensionAppearanceRepository,
  prepareExtensionAppearance,
  resolveExtensionAssignment,
  createAdminShellStore,
  parseAdminShellStore,
  prepareAdminShell,
  applyAdminShell,
  hashAdminShellPolicy,
} from "@realize/payload-extension-manager/server";
import { ExtensionStateRepository } from "../../packages/payload-extension-manager/src/persistence/ExtensionState.repository";
import { extensionAppearanceStateCodec } from "../../packages/payload-extension-manager/src/persistence/extensionAppearanceStateCodec.validator";
import { createExtensionManagerCollections } from "../../packages/payload-extension-manager/src/extensionManagerCollections.config";
import {
  EXTENSION_MANAGER_RECEIPTS_SLUG,
  EXTENSION_MANAGER_STATE_SLUG,
} from "../../packages/payload-extension-manager/src/persistence/extensionAppearancePersistence.constants";
import * as appearanceMigration from "../../src/migrations/20261012_094626_extension_manager_state";

describe.skipIf(!process.env.EXTENSION_TEST_DATABASE_URI)(
  "appearance persistence on owned PostgreSQL",
  () => {
    let db: Client;
    let payload: Payload;
    let startPayload: () => Promise<Payload>;
    const actorKey = "users:extension-fixture";
    const catalog = createExtensionCatalog({
      entries: [
        {
          manifest: realizeTemplateManifest,
          settingsSchema,
          resolveSettings: resolveRealizeSettings,
        },
      ],
      hostCompatibility: {
        contractVersion: "1.0",
        platformVersion: "1.0.0",
        reactVersion: "19.2.8",
        nextVersion: "16.3.1",
      },
      runtimeBuildId: "extension-fixture-build",
    });
    const selection = {
      templateId: "realize",
      templateVersion: "0.1.0",
      target: "admin" as const,
      paletteId: "realize",
      paletteVersion: "0.1.0",
      mode: "light" as const,
    };
    const bootstrap = createExtensionAppearanceStore({
      admin: resolveExtensionAssignment({
        catalog,
        target: "admin",
        selection,
        settings: { density: "comfortable", panelWidth: 280 },
      }),
    });
    const shellPolicy: AdminShellPolicy = {
      enabled: { native: true, template: true },
      defaultMode: "native",
      fallbackMode: "native",
      nativeVersion: "3.88.0",
      nativeRoute: "/admin",
      templateRoute: "/system",
    };
    const shellBootstrap = createAdminShellStore(shellPolicy);
    const shellCodec = {
      parseStore: parseAdminShellStore,
      parseReceipt: (input: unknown) => adminShellReceiptSchema.parse(input),
    };
    const shellRepository = () =>
      new ExtensionStateRepository(payload, shellCodec);
    const appearanceDependency = (scopeKey: string) => ({
      appearance: { scopeKey, bootstrap, codec: extensionAppearanceStateCodec },
    });
    const scope = () => `fixture:${randomUUID()}`;
    const repository = () => new ExtensionAppearanceRepository(payload);
    const request = () => createLocalReq({}, payload);
    const command = (
      revision = 0,
      panelWidth = 260,
    ): PrepareExtensionAppearanceInput => ({
      action: "assign",
      target: "admin",
      expectedRevision: revision,
      expectedCatalogHash: catalog.catalogHash,
      selection,
      settings: { density: "compact", panelWidth },
    });
    const prepare = async (
      scopeKey: string,
      input = command(),
      requestId = randomUUID(),
      nowMs = Date.now(),
    ) =>
      repository().mutate(
        await request(),
        scopeKey,
        bootstrap,
        (store: ExtensionAppearanceStore) => {
          const result = prepareExtensionAppearance({
            store,
            catalog,
            actorKey,
            requestId,
            planId: randomUUID(),
            input,
            nowMs,
          });
          return { store: result.store, result };
        },
        { actorKey, requestId, kind: "prepare" },
      );
    const apply = async (
      scopeKey: string,
      plan: ExtensionAppearancePlanDto,
      requestId = randomUUID(),
      nowMs = Date.now(),
      expectedPlanHash = plan.planHash,
    ) =>
      repository().mutate(
        await request(),
        scopeKey,
        bootstrap,
        (store: ExtensionAppearanceStore) => {
          const result = applyExtensionAppearance({
            store,
            catalog,
            actorKey,
            requestId,
            input: { planId: plan.planId, expectedPlanHash },
            nowMs,
          });
          return { store: result.store, result };
        },
        { actorKey, requestId, kind: "apply" },
      );
    const counts = async (scopeKey: string) =>
      (
        await db.query(
          "SELECT (SELECT count(*)::int FROM realize_extension_manager_state WHERE scope_key=$1) AS states, (SELECT count(*)::int FROM realize_extension_manager_receipts WHERE scope_key=$1) AS receipts",
          [scopeKey],
        )
      ).rows[0];

    const prepareShell = async (
      scopeKey: string,
      appearanceScope: string,
      mode: AdminShellMode,
      revision = 0,
      requestId = randomUUID(),
    ) => {
      const input = {
        action: "select",
        mode,
        expectedRevision: revision,
        expectedPolicyHash: hashAdminShellPolicy(shellPolicy),
      };
      const req = await request();
      const replay = { actorKey, requestId, kind: "prepare" as const };
      if (mode === "native")
        return shellRepository().mutate(
          req,
          scopeKey,
          shellBootstrap,
          (store) => {
            const result = prepareAdminShell({
              store,
              policy: shellPolicy,
              appearance: null,
              actorKey,
              requestId,
              planId: randomUUID(),
              input,
              nowMs: Date.now(),
            });
            return { store: result.store, result };
          },
          replay,
        );
      return shellRepository().mutate(
        req,
        scopeKey,
        shellBootstrap,
        (store, dependencies) => {
          const result = prepareAdminShell({
            store,
            policy: shellPolicy,
            appearance: dependencies.appearance
              ? { store: dependencies.appearance, catalog }
              : null,
            actorKey,
            requestId,
            planId: randomUUID(),
            input,
            nowMs: Date.now(),
          });
          return { store: result.store, result };
        },
        replay,
        appearanceDependency(appearanceScope),
      );
    };
    const applyShell = async (
      scopeKey: string,
      appearanceScope: string,
      plan: AdminShellPlanDto,
      requestId = randomUUID(),
    ) => {
      const req = await request();
      const replay = { actorKey, requestId, kind: "apply" as const };
      const input = { planId: plan.planId, expectedPlanHash: plan.planHash };
      if (plan.desiredMode === "native")
        return shellRepository().mutate(
          req,
          scopeKey,
          shellBootstrap,
          (store) => {
            const result = applyAdminShell({
              store,
              policy: shellPolicy,
              appearance: null,
              actorKey,
              requestId,
              input,
              nowMs: Date.now(),
            });
            return { store: result.store, result };
          },
          replay,
        );
      return shellRepository().mutate(
        req,
        scopeKey,
        shellBootstrap,
        (store, dependencies) => {
          const result = applyAdminShell({
            store,
            policy: shellPolicy,
            appearance: dependencies.appearance
              ? { store: dependencies.appearance, catalog }
              : null,
            actorKey,
            requestId,
            input,
            nowMs: Date.now(),
          });
          return { store: result.store, result };
        },
        replay,
        appearanceDependency(appearanceScope),
      );
    };

    /** Exact source migration выполняется настоящим pg.Client только в owned fixture DB. */
    const migrate = async (operation: typeof appearanceMigration.up) => {
      const dialect = new PgDialect();
      await db.query("BEGIN");
      try {
        await operation({
          db: {
            execute: async (statement) => {
              if (typeof statement === "string") return db.query(statement);
              const query = dialect.sqlToQuery(statement.getSQL());
              return db.query(query.sql, query.params);
            },
          },
        } as MigrateUpArgs);
        await db.query("COMMIT");
      } catch (error) {
        await db.query("ROLLBACK");
        throw error;
      }
    };

    beforeAll(async () => {
      const uri = new URL(process.env.EXTENSION_TEST_DATABASE_URI!);
      if (
        uri.hostname !== "127.0.0.1" ||
        !/^realize_extension_fixture_[a-f0-9]{16}$/.test(
          uri.pathname.slice(1),
        ) ||
        process.env.DATABASE_URI !== uri.href ||
        process.env.DATABASE_URL !== uri.href ||
        process.env.PAYLOAD_DB_PUSH !== "false" ||
        process.env.PAYLOAD_DROP_DATABASE !== "false" ||
        process.env.REALIZE_AI_RUNTIME_ISOLATED !== "true"
      )
        throw new Error("OWNED_EXTENSION_DATABASE_REQUIRED");
      db = new Client({ connectionString: uri.href });
      await db.connect();
      expect(
        (
          await db.query(
            "SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema='public'",
          )
        ).rows[0].count,
      ).toBe(0);
      await migrate(appearanceMigration.up);
      await migrate(appearanceMigration.down);
      expect(
        (
          await db.query(
            "SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema='public'",
          )
        ).rows[0].count,
      ).toBe(0);
      await migrate(appearanceMigration.up);
      startPayload = () =>
        getPayload({
          key: `extension-fixture:${randomUUID()}`,
          config: buildConfig({
            secret: randomBytes(32).toString("hex"),
            telemetry: false,
            logger: { options: { level: "silent" } },
            admin: { disable: true, importMap: { autoGenerate: false } },
            db: postgresAdapter({
              pool: { connectionString: uri.href },
              push: false,
              disableCreateDatabase: true,
            }),
            collections: createExtensionManagerCollections(),
          }),
        });
      payload = await startPayload();
    }, 60000);

    afterAll(async () => {
      try {
        await payload?.destroy();
      } finally {
        await db?.end();
      }
    });

    it("distinguishes ready empty storage from a missing state or receipt table", async () => {
      expect(await repository().read(scope())).toEqual({
        store: null,
        storageReady: true,
      });
      for (const table of [
        "realize_extension_manager_state",
        "realize_extension_manager_receipts",
      ]) {
        await db.query(
          `ALTER TABLE ${table} RENAME TO extension_fixture_temporarily_absent`,
        );
        try {
          expect(await repository().read(scope())).toEqual({
            store: null,
            storageReady: false,
          });
          await expect(prepare(scope())).rejects.toMatchObject({
            code: "STORAGE_UNAVAILABLE",
            status: 503,
          });
        } finally {
          await db.query(
            `ALTER TABLE extension_fixture_temporarily_absent RENAME TO ${table}`,
          );
        }
      }
    });

    it("persists assignment and immutable replay across a real Payload restart", async () => {
      const scopeKey = scope();
      const prepared = await prepare(scopeKey);
      const requestId = randomUUID();
      const applied = await apply(scopeKey, prepared.plan, requestId);
      expect(applied.receipt.appliedRevision).toBe(1);
      await payload.destroy();
      payload = await startPayload();
      const snapshot = await repository().read(scopeKey);
      expect(snapshot.store?.targets.admin).toMatchObject({
        revision: 1,
        current: { settings: { density: "compact", panelWidth: 260 } },
        previous: bootstrap.targets.admin.current,
      });
      expect((await apply(scopeKey, prepared.plan, requestId)).replayed).toBe(
        true,
      );
      expect(await counts(scopeKey)).toEqual({ states: 1, receipts: 2 });
      expect(
        (
          await db.query(
            "SELECT state->'receipts' AS receipts FROM realize_extension_manager_state WHERE scope_key=$1",
            [scopeKey],
          )
        ).rows[0].receipts,
      ).toEqual([]);
    });

    it("serializes concurrent first requests and protects identical prepare replay", async () => {
      const scopeKey = scope();
      const requestId = randomUUID();
      const [first, second] = await Promise.all([
        prepare(scopeKey, command(), requestId),
        prepare(scopeKey, command(), requestId),
      ]);
      expect(first.plan).toEqual(second.plan);
      expect([first.replayed, second.replayed].sort()).toEqual([false, true]);
      expect(await counts(scopeKey)).toEqual({ states: 1, receipts: 1 });
      await expect(
        prepare(scopeKey, command(0, 300), requestId),
      ).rejects.toMatchObject({ code: "REPLAY_CONFLICT", status: 409 });
    });

    it("commits only one winner for simultaneous plans against the same revision", async () => {
      const scopeKey = scope();
      const [first, second] = await Promise.all([
        prepare(scopeKey, command(0, 250)),
        prepare(scopeKey, command(0, 300)),
      ]);
      const results = await Promise.allSettled([
        apply(scopeKey, first.plan),
        apply(scopeKey, second.plan),
      ]);
      expect(
        results.filter((result) => result.status === "fulfilled"),
      ).toHaveLength(1);
      const rejected = results.find((result) => result.status === "rejected");
      expect(rejected).toMatchObject({
        status: "rejected",
        reason: { code: "REVISION_CONFLICT" },
      });
      expect(
        (await repository().read(scopeKey)).store?.targets.admin.revision,
      ).toBe(1);
      expect(await counts(scopeKey)).toEqual({ states: 1, receipts: 3 });
    });

    it("namespaces one request UUID by prepare/apply and refuses changed apply replay", async () => {
      const scopeKey = scope();
      const requestId = randomUUID();
      const prepared = await prepare(scopeKey, command(), requestId);
      const applied = await apply(scopeKey, prepared.plan, requestId);
      expect(applied.replayed).toBe(false);
      expect((await apply(scopeKey, prepared.plan, requestId)).replayed).toBe(
        true,
      );
      await expect(
        apply(scopeKey, prepared.plan, requestId, Date.now(), "f".repeat(64)),
      ).rejects.toMatchObject({ code: "REPLAY_CONFLICT" });
      expect(await counts(scopeKey)).toEqual({ states: 1, receipts: 2 });
    });

    it("isolates replay identities by actor and server scope", async () => {
      const scopeKey = scope();
      const requestId = randomUUID();
      const first = await prepare(scopeKey, command(), requestId);
      const otherActor = "users:another-extension-fixture";
      const second = await repository().mutate(
        await request(),
        scopeKey,
        bootstrap,
        (store) => {
          const result = prepareExtensionAppearance({
            store,
            catalog,
            actorKey: otherActor,
            requestId,
            planId: randomUUID(),
            input: command(),
            nowMs: Date.now(),
          });
          return { store: result.store, result };
        },
        { actorKey: otherActor, requestId, kind: "prepare" },
      );
      expect(second.replayed).toBe(false);
      expect(second.plan.planId).not.toBe(first.plan.planId);
      const otherApplyKey = randomUUID();
      await expect(
        repository().mutate(
          await request(),
          scopeKey,
          bootstrap,
          (store) => {
            const result = applyExtensionAppearance({
              store,
              catalog,
              actorKey: otherActor,
              requestId: otherApplyKey,
              input: {
                planId: first.plan.planId,
                expectedPlanHash: first.plan.planHash,
              },
              nowMs: Date.now(),
            });
            return { store: result.store, result };
          },
          { actorKey: otherActor, requestId: otherApplyKey, kind: "apply" },
        ),
      ).rejects.toMatchObject({ code: "PLAN_ACTOR_MISMATCH" });
      const otherScope = scope();
      expect((await prepare(otherScope, command(), requestId)).replayed).toBe(
        false,
      );
      expect(await counts(scopeKey)).toEqual({ states: 1, receipts: 2 });
      expect(await counts(otherScope)).toEqual({ states: 1, receipts: 1 });
    });

    it("keeps old UUID ownership after pending plan pruning and more than 256 receipts", async () => {
      const scopeKey = scope();
      const oldPrepareKey = randomUUID();
      const oldApplyKey = randomUUID();
      const nowMs = Date.now();
      const first = await prepare(scopeKey, command(), oldPrepareKey, nowMs);
      await apply(scopeKey, first.plan, oldApplyKey, nowMs + 1);
      for (let revision = 1; revision <= 128; revision += 1) {
        const prepared = await prepare(
          scopeKey,
          command(revision, revision % 2 ? 250 : 300),
          randomUUID(),
          nowMs + revision * 2,
        );
        await apply(
          scopeKey,
          prepared.plan,
          randomUUID(),
          nowMs + revision * 2 + 1,
        );
      }
      const snapshot = await repository().read(scopeKey);
      expect(snapshot.store?.targets.admin.revision).toBe(129);
      expect(snapshot.store?.plans).toEqual([]);
      expect(snapshot.store?.receipts).toHaveLength(32);
      expect(await counts(scopeKey)).toEqual({ states: 1, receipts: 258 });
      const replay = await apply(
        scopeKey,
        first.plan,
        oldApplyKey,
        nowMs + 24 * 60 * 60 * 1000,
      );
      expect(replay.replayed).toBe(true);
      expect(replay.receipt.appliedRevision).toBe(1);
      await expect(
        prepare(
          scopeKey,
          command(),
          oldPrepareKey,
          nowMs + 24 * 60 * 60 * 1000,
        ),
      ).rejects.toMatchObject({ code: "PLAN_EXPIRED" });
      await expect(
        prepare(
          scopeKey,
          command(129, 300),
          oldPrepareKey,
          nowMs + 24 * 60 * 60 * 1000,
        ),
      ).rejects.toMatchObject({ code: "REPLAY_CONFLICT" });
      expect(
        (await repository().read(scopeKey)).store?.targets.admin.revision,
      ).toBe(129);
    }, 60000);

    it("rolls back both state and receipt when the native receipt insert fails", async () => {
      const scopeKey = scope();
      const prepared = await prepare(scopeKey);
      const before = await repository().read(scopeKey);
      await db.query(`CREATE FUNCTION extension_fixture_reject_apply() RETURNS trigger AS $$
        BEGIN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='private-driver-fixture-error'; END;
        $$ LANGUAGE plpgsql;
        CREATE TRIGGER extension_fixture_reject_apply BEFORE INSERT ON realize_extension_manager_receipts
        FOR EACH ROW WHEN (NEW.kind = 'apply') EXECUTE FUNCTION extension_fixture_reject_apply();`);
      try {
        await expect(apply(scopeKey, prepared.plan)).rejects.toMatchObject({
          code: "STORAGE_UNAVAILABLE",
          status: 503,
        });
      } finally {
        await db.query(
          "DROP TRIGGER extension_fixture_reject_apply ON realize_extension_manager_receipts; DROP FUNCTION extension_fixture_reject_apply()",
        );
      }
      expect(await repository().read(scopeKey)).toEqual(before);
      expect(await counts(scopeKey)).toEqual({ states: 1, receipts: 1 });
      expect(
        (await apply(scopeKey, prepared.plan)).receipt.appliedRevision,
      ).toBe(1);
    });

    it("rolls back callback failure without losing its safe domain error", async () => {
      const scopeKey = scope();
      await expect(
        repository().mutate(
          await request(),
          scopeKey,
          bootstrap,
          () => {
            throw new ExtensionManagerError("INVALID_SETTINGS");
          },
          { actorKey, requestId: randomUUID(), kind: "prepare" },
        ),
      ).rejects.toMatchObject({ code: "INVALID_SETTINGS" });
      expect(await counts(scopeKey)).toEqual({ states: 0, receipts: 0 });
      expect((await prepare(scopeKey)).replayed).toBe(false);
    });

    it("refuses caller-owned transactions and leaves them under caller control", async () => {
      const req = await request();
      expect(await initTransaction(req)).toBe(true);
      const transactionId = await req.transactionID;
      try {
        await expect(
          repository().mutate(
            req,
            scope(),
            bootstrap,
            () => {
              throw new Error("callback must not run");
            },
            { actorKey, requestId: randomUUID(), kind: "prepare" },
          ),
        ).rejects.toMatchObject({ code: "INDEPENDENT_TRANSACTION_REQUIRED" });
        expect(await req.transactionID).toBe(transactionId);
      } finally {
        await killTransaction(req);
      }
    });

    it("denies native CRUD and rejects receipt rewriting even with overrideAccess", async () => {
      const scopeKey = scope();
      await prepare(scopeKey);
      const row = (
        await db.query(
          "SELECT id FROM realize_extension_manager_receipts WHERE scope_key=$1",
          [scopeKey],
        )
      ).rows[0];
      await expect(
        payload.find({
          collection: EXTENSION_MANAGER_STATE_SLUG as CollectionSlug,
          overrideAccess: false,
          req: await request(),
        }),
      ).rejects.toMatchObject({ status: 403 });
      await expect(
        payload.update({
          collection: EXTENSION_MANAGER_RECEIPTS_SLUG as CollectionSlug,
          id: row.id,
          data: {},
          overrideAccess: true,
          req: await request(),
        }),
      ).rejects.toMatchObject({ code: "IMMUTABLE_RECEIPT" });
      await expect(
        payload.delete({
          collection: EXTENSION_MANAGER_RECEIPTS_SLUG as CollectionSlug,
          id: row.id,
          overrideAccess: true,
          req: await request(),
        }),
      ).rejects.toMatchObject({ code: "IMMUTABLE_RECEIPT" });
      await expect(
        db.query(
          "UPDATE realize_extension_manager_receipts SET record=record WHERE id=$1",
          [row.id],
        ),
      ).rejects.toMatchObject({
        code: "P0001",
        message: "EXTENSION_RECEIPT_IMMUTABLE",
      });
      await expect(
        db.query("DELETE FROM realize_extension_manager_receipts WHERE id=$1", [
          row.id,
        ]),
      ).rejects.toMatchObject({
        code: "P0001",
        message: "EXTENSION_RECEIPT_IMMUTABLE",
      });
      expect(await counts(scopeKey)).toEqual({ states: 1, receipts: 1 });
    });

    it("fails closed for invalid stored JSON and sanitizes unrelated SQL errors", async () => {
      const scopeKey = scope();
      await prepare(scopeKey);
      await db.query(
        "UPDATE realize_extension_manager_state SET state=$1 WHERE scope_key=$2",
        [JSON.stringify({ private: "invalid-fixture-json" }), scopeKey],
      );
      await expect(repository().read(scopeKey)).rejects.toMatchObject({
        code: "INVALID_STORAGE_STATE",
        status: 503,
      });
      await expect(prepare(scopeKey)).rejects.toMatchObject({
        code: "INVALID_STORAGE_STATE",
        status: 503,
      });
      await db.query(
        "ALTER TABLE realize_extension_manager_state RENAME COLUMN state TO fixture_wrong_column",
      );
      try {
        await expect(repository().read(scope())).rejects.toMatchObject({
          code: "STORAGE_UNAVAILABLE",
          status: 503,
        });
      } finally {
        await db.query(
          "ALTER TABLE realize_extension_manager_state RENAME COLUMN fixture_wrong_column TO state",
        );
      }
    });

    it("refuses destructive down after durable records exist", async () => {
      await expect(migrate(appearanceMigration.down)).rejects.toMatchObject({
        code: "P0001",
        message: "EXTENSION_ROLLBACK_BLOCKED",
      });
      expect(
        (
          await db.query(
            "SELECT count(*)::int AS count FROM realize_extension_manager_receipts",
          )
        ).rows[0].count,
      ).toBeGreaterThan(0);
      expect(
        (
          await db.query(
            "SELECT count(*)::int AS count FROM realize_extension_manager_state",
          )
        ).rows[0].count,
      ).toBeGreaterThan(0);
    });

    it("holds the appearance dependency lock through shell CAS and its native commit", async () => {
      const appearanceScope = scope();
      const shellScope = `${appearanceScope}:admin-shell`;
      const prepared = await prepareShell(
        shellScope,
        appearanceScope,
        "template",
      );
      const appearancePlan = await prepare(appearanceScope);
      let enter!: () => void;
      let release!: () => void;
      const entered = new Promise<void>((resolve) => {
        enter = resolve;
      });
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const requestId = randomUUID();
      const selecting = shellRepository().mutate(
        await request(),
        shellScope,
        shellBootstrap,
        async (store, dependencies) => {
          enter();
          await gate;
          const result = applyAdminShell({
            store,
            policy: shellPolicy,
            appearance: dependencies.appearance
              ? { store: dependencies.appearance, catalog }
              : null,
            actorKey,
            requestId,
            input: {
              planId: prepared.plan.planId,
              expectedPlanHash: prepared.plan.planHash,
            },
            nowMs: Date.now(),
          });
          return { store: result.store, result };
        },
        { actorKey, requestId, kind: "apply" },
        appearanceDependency(appearanceScope),
      );
      await entered;
      const changingAppearance = apply(appearanceScope, appearancePlan.plan);
      let observed: string;
      try {
        observed = await Promise.race([
          changingAppearance.then(() => "completed"),
          new Promise<string>((resolve) => {
            setTimeout(() => resolve("blocked"), 40);
          }),
        ]);
      } finally {
        release();
      }
      const [shellResult, appearanceResult] = await Promise.all([
        selecting,
        changingAppearance,
      ]);
      expect(observed).toBe("blocked");
      expect(shellResult.receipt).toMatchObject({
        mode: "template",
        appliedRevision: 1,
      });
      expect(appearanceResult.receipt.appliedRevision).toBe(1);
      expect(
        (await shellRepository().read(shellScope)).store?.state,
      ).toMatchObject({ current: "template", revision: 1 });
      expect(
        (await repository().read(appearanceScope)).store?.targets.admin
          .revision,
      ).toBe(1);
    });

    it("rejects a shell plan after appearance CAS changed without writing a shell apply receipt", async () => {
      const appearanceScope = scope();
      const shellScope = `${appearanceScope}:admin-shell`;
      const prepared = await prepareShell(
        shellScope,
        appearanceScope,
        "template",
      );
      const appearancePlan = await prepare(appearanceScope);
      await apply(appearanceScope, appearancePlan.plan);
      await expect(
        applyShell(shellScope, appearanceScope, prepared.plan),
      ).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
      expect(
        (await shellRepository().read(shellScope)).store?.state,
      ).toMatchObject({ current: "native", revision: 0 });
      expect(await counts(shellScope)).toEqual({ states: 1, receipts: 1 });
    });

    it("replays shell receipt without reading corrupted appearance or invoking lazy bootstrap", async () => {
      const appearanceScope = scope();
      const shellScope = `${appearanceScope}:admin-shell`;
      await prepare(appearanceScope);
      const prepared = await prepareShell(
        shellScope,
        appearanceScope,
        "template",
      );
      const requestId = randomUUID();
      const applied = await applyShell(
        shellScope,
        appearanceScope,
        prepared.plan,
        requestId,
      );
      await db.query(
        "UPDATE realize_extension_manager_state SET state='null'::jsonb WHERE scope_key=$1",
        [appearanceScope],
      );
      let bootstrapCalls = 0;
      const replayed = await shellRepository().mutate(
        await request(),
        shellScope,
        shellBootstrap,
        (store, dependencies) => {
          expect(dependencies.appearance).toBeNull();
          const result = applyAdminShell({
            store,
            policy: {
              ...shellPolicy,
              enabled: { native: true, template: false },
            },
            appearance: null,
            actorKey,
            requestId,
            input: {
              planId: prepared.plan.planId,
              expectedPlanHash: prepared.plan.planHash,
            },
            nowMs: Date.now() + 24 * 60 * 60 * 1000,
          });
          return { store: result.store, result };
        },
        { actorKey, requestId, kind: "apply" },
        {
          appearance: {
            scopeKey: appearanceScope,
            codec: extensionAppearanceStateCodec,
            bootstrap: () => {
              bootstrapCalls += 1;
              throw new Error("lazy bootstrap must not run on replay");
            },
          },
        },
      );
      expect(replayed.replayed).toBe(true);
      expect(replayed.receipt).toEqual(applied.receipt);
      expect(bootstrapCalls).toBe(0);
      await expect(
        prepareShell(shellScope, appearanceScope, "template", 1),
      ).rejects.toMatchObject({ code: "INVALID_STORAGE_STATE" });
      const native = await prepareShell(
        shellScope,
        appearanceScope,
        "native",
        1,
      );
      expect(
        (await applyShell(shellScope, appearanceScope, native.plan)).receipt
          .mode,
      ).toBe("native");
      expect(
        (
          await db.query(
            "SELECT state FROM realize_extension_manager_state WHERE scope_key=$1",
            [appearanceScope],
          )
        ).rows[0].state,
      ).toBeNull();
    });

    it("bootstraps a missing dependency lazily inside the transaction without initializing its scope", async () => {
      const appearanceScope = scope();
      const shellScope = `${appearanceScope}:admin-shell`;
      let calls = 0;
      const requestId = randomUUID();
      const prepared = await shellRepository().mutate(
        await request(),
        shellScope,
        shellBootstrap,
        (store, dependencies) => {
          const result = prepareAdminShell({
            store,
            policy: shellPolicy,
            appearance: dependencies.appearance
              ? { store: dependencies.appearance, catalog }
              : null,
            actorKey,
            requestId,
            planId: randomUUID(),
            input: {
              action: "select",
              mode: "template",
              expectedRevision: 0,
              expectedPolicyHash: hashAdminShellPolicy(shellPolicy),
            },
            nowMs: Date.now(),
          });
          return { store: result.store, result };
        },
        { actorKey, requestId, kind: "prepare" },
        {
          appearance: {
            scopeKey: appearanceScope,
            codec: extensionAppearanceStateCodec,
            bootstrap: async () => {
              calls += 1;
              return bootstrap;
            },
          },
        },
      );
      expect(calls).toBe(1);
      expect(prepared.plan.templateBinding?.appearanceRevision).toBe(0);
      expect(await counts(appearanceScope)).toEqual({ states: 0, receipts: 0 });
      const record = (
        await db.query(
          "SELECT id FROM realize_extension_manager_receipts WHERE scope_key=$1",
          [shellScope],
        )
      ).rows[0];
      await expect(
        payload.update({
          collection: EXTENSION_MANAGER_RECEIPTS_SLUG as CollectionSlug,
          id: record.id,
          data: {},
          overrideAccess: true,
          req: await request(),
        }),
      ).rejects.toMatchObject({ code: "IMMUTABLE_RECEIPT" });
      await expect(
        db.query("DELETE FROM realize_extension_manager_receipts WHERE id=$1", [
          record.id,
        ]),
      ).rejects.toMatchObject({
        code: "P0001",
        message: "EXTENSION_RECEIPT_IMMUTABLE",
      });
    });
  },
);
