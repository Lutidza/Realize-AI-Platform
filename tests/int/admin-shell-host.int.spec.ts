// @vitest-environment node
/**
 * @file tests/int/admin-shell-host.int.spec.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Проверяет реальные shell HTTP/host operations с repository mock без DB/installed route claims.
 * @see documentation/specifications/extension-management.md
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Payload, PayloadRequest } from "payload";
import type { DashboardViewServerProps } from "@payloadcms/next/views";
import { NextRequest } from "next/server";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import manifest from "@realize/template-realize/manifest.json";
import settingsSchema from "@realize/template-realize/settings.schema.json";
import { resolveRealizeSettings } from "@realize/template-realize/settings";
import type { ExtensionManagerOptions } from "../../packages/payload-extension-manager/src/ExtensionManagerOptions.types";
import type {
  AdminShellStore,
  AdminShellPolicy,
  AdminShellReceipt,
} from "../../packages/payload-extension-manager/src/admin-shell/AdminShell.types";
import type {
  ExtensionStateDependencies,
  LedgerIdentity,
} from "../../packages/payload-extension-manager/src/persistence/ExtensionStatePersistence.types";
import {
  adminShellSnapshotSchema,
  adminShellPrepareResponseSchema,
  adminShellApplyResponseSchema,
} from "../../packages/payload-extension-manager/src/extensionManagerContracts.index";
import { createAdminShellStore } from "../../packages/payload-extension-manager/src/admin-shell/createAdminShellStore.util";
import { hashAdminShellPolicy } from "../../packages/payload-extension-manager/src/admin-shell/hashAdminShellPolicy.server";
import { createExtensionManagerEndpoints } from "../../packages/payload-extension-manager/src/server/extensionManagerEndpoints.controller";
import { resolveExtensionManagerOptions } from "../../packages/payload-extension-manager/src/extensionManagerOptions.config";
import { readAdminShellRuntime } from "../../packages/payload-extension-manager/src/server/readAdminShellRuntime.service";
import { AdminShellService } from "../../packages/payload-extension-manager/src/server/AdminShell.service";
import { ExtensionAppearanceStorageError } from "../../packages/payload-extension-manager/src/persistence/ExtensionAppearanceStorage.error";

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  mutate: vi.fn(),
  appearanceRead: vi.fn(),
  appearanceMutate: vi.fn(),
  nativeDashboard: vi.fn(() => null),
  options: undefined as unknown as ExtensionManagerOptions,
  redirect: vi.fn((path: string): never => {
    throw new Error(`redirect:${path}`);
  }),
  notFound: vi.fn((): never => {
    throw new Error("not-found");
  }),
}));

/** Storage mock исполняет production callback; транзакции/SQL здесь не моделируются и не проверяются. */
vi.mock(
  "../../packages/payload-extension-manager/src/persistence/ExtensionState.repository",
  () => ({
    ExtensionStateRepository: class {
      read = mocks.read;
      mutate = mocks.mutate;
    },
  }),
);
vi.mock(
  "../../packages/payload-extension-manager/src/persistence/ExtensionAppearance.repository",
  () => ({
    ExtensionAppearanceRepository: class {
      read = mocks.appearanceRead;
      mutate = mocks.appearanceMutate;
    },
  }),
);
vi.mock("@payloadcms/next/views", () => ({
  DefaultDashboard: mocks.nativeDashboard,
}));
vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
  notFound: mocks.notFound,
}));
vi.mock("@/plugins/extensionManager.config", () => ({
  get extensionManagerOptions() {
    return mocks.options;
  },
}));
import { SystemAdminDashboard } from "../../src/components/admin/system-shell/SystemAdminDashboard.view";

const NOW = Date.parse("2026-10-12T17:00:00.000Z");
const PREPARE_ID = "00000000-0000-4000-8000-000000000001";
const APPLY_ID = "00000000-0000-4000-8000-000000000002";
type FixtureUser = { id: number; collection: string; roles: string[] };
type MalformedRequestCase = {
  headers?: Record<string, string>;
  query?: string;
  rawBody?: string;
  expected: number;
};

function fixture(apiRoute = "/realize-extensions") {
  let policy: AdminShellPolicy = {
    enabled: { native: true, template: true },
    defaultMode: "template",
    fallbackMode: "native",
    nativeVersion: "3.88.0",
    nativeRoute: "/admin",
    templateRoute: "/system",
  };
  let store: AdminShellStore | null = null;
  let ready = true;
  const ledger = new Map<string, AdminShellReceipt>();
  const policyReader = vi.fn(async () => policy);
  const runtimeReader = vi.fn(async () => "fixture_build_1");
  const admitted = (req: PayloadRequest) =>
    req.user?.collection === "users" &&
    (req.user as unknown as FixtureUser).roles.includes("admin");
  const access = {
    canReadCatalog: vi.fn(({ req }: { req: PayloadRequest }) => admitted(req)),
    canManageAppearance: vi.fn(({ req }: { req: PayloadRequest }) =>
      admitted(req),
    ),
    canInstallCode: vi.fn(() => false),
  };
  const options: ExtensionManagerOptions = {
    userCollection: "users",
    scopeKey: "fixture:appearance",
    apiRoute,
    adminShell: policyReader,
    catalog: [
      { manifest, settingsSchema, resolveSettings: resolveRealizeSettings },
    ],
    hostCompatibility: {
      contractVersion: "1.0",
      platformVersion: "1.0.0",
      reactVersion: "19.2.8",
      nextVersion: "16.3.1",
    },
    defaultAdmin: {
      selection: {
        templateId: "realize",
        templateVersion: "0.1.0",
        target: "admin",
        paletteId: "realize",
        paletteVersion: "0.1.0",
        mode: "light",
      },
      settings: {},
    },
    runtimeBuildId: runtimeReader,
    access,
  };
  const payload = {
    config: { csrf: ["https://trusted.test"], serverURL: "http://localhost" },
  };
  mocks.options = options;
  mocks.read.mockImplementation(async () => ({
    store: store
      ? {
          ...store,
          receipts: [...ledger.values()].filter(
            (receipt) => receipt.kind === "apply",
          ),
        }
      : null,
    storageReady: ready,
  }));
  mocks.appearanceRead.mockResolvedValue({ store: null, storageReady: true });
  const mutate = async (
    _req: PayloadRequest,
    _scope: string,
    bootstrap: AdminShellStore,
    operation: (
      state: AdminShellStore,
      dependencies: Record<string, unknown>,
    ) => Promise<{ store: AdminShellStore; result: unknown }>,
    replay: LedgerIdentity,
    dependencies: ExtensionStateDependencies = {},
  ) => {
    const key = JSON.stringify([
      replay.actorKey,
      replay.kind,
      replay.requestId,
    ]);
    const receipt = ledger.get(key);
    const dependencyStates: Record<string, unknown> = {};
    for (const [name, spec] of Object.entries(dependencies))
      dependencyStates[name] = receipt
        ? null
        : typeof spec.bootstrap === "function"
          ? await spec.bootstrap()
          : spec.bootstrap;
    const current = {
      ...(store ?? bootstrap),
      receipts: receipt ? [receipt] : [],
    };
    const outcome = await operation(current, dependencyStates);
    store = { ...outcome.store, receipts: [] };
    for (const record of outcome.store.receipts)
      ledger.set(
        JSON.stringify([record.actorKey, record.kind, record.requestId]),
        record,
      );
    return outcome.result;
  };
  mocks.mutate.mockImplementation(mutate);
  const endpoints = createExtensionManagerEndpoints(
    resolveExtensionManagerOptions(options),
  );
  const req = (
    input: {
      path?: string;
      url?: string;
      method?: "get" | "post";
      user?: FixtureUser | null;
      body?: unknown;
      rawBody?: string | Uint8Array;
      headers?: Record<string, string>;
      query?: string;
      planId?: string;
    } = {},
  ) => {
    const path = input.path ?? "/admin-shell";
    const method = input.method ?? "get";
    const web = new Request(
      input.url ?? `http://localhost/api${apiRoute}${path}${input.query ?? ""}`,
      {
        method: method.toUpperCase(),
        headers: {
          ...(method === "post"
            ? {
                "content-type": "application/json",
                "idempotency-key": PREPARE_ID,
              }
            : {}),
          ...input.headers,
        },
        ...(method === "post"
          ? { body: input.rawBody ?? JSON.stringify(input.body ?? {}) }
          : {}),
      } as RequestInit,
    );
    return Object.assign(web, {
      payload,
      user:
        input.user === undefined
          ? { id: 17, collection: "users", roles: ["admin"] }
          : input.user,
      routeParams: { id: input.planId ?? "" },
    }) as unknown as PayloadRequest;
  };
  const call = async (input: Parameters<typeof req>[0] = {}) => {
    const endpoint = endpoints.find(
      (candidate) =>
        candidate.path === `${apiRoute}${input.path ?? "/admin-shell"}` &&
        candidate.method === (input.method ?? "get"),
    );
    if (!endpoint) throw new Error("Missing fixture endpoint");
    return endpoint.handler(req(input));
  };
  const select = (mode: "native" | "template" = "native") => ({
    action: "select",
    mode,
    expectedRevision: store?.state.revision ?? 0,
    expectedPolicyHash: hashAdminShellPolicy(policy),
  });
  const dashboardProps = (query = "", user?: FixtureUser | null) =>
    ({
      initPageResult: {
        req: req({ user, url: `http://localhost/admin${query}` }),
      },
    }) as unknown as DashboardViewServerProps;
  return {
    options,
    payload,
    policyReader,
    runtimeReader,
    access,
    req,
    call,
    select,
    dashboardProps,
    mutate,
    setStore: (value: AdminShellStore | null) => {
      store = value;
    },
    store: () => store,
    setPolicy: (value: AdminShellPolicy) => {
      policy = value;
    },
    policy: () => policy,
    setReady: (value: boolean) => {
      ready = value;
    },
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.spyOn(Date, "now").mockReturnValue(NOW);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("Admin shell HTTP admission and wire contracts", () => {
  it("rejects direct prepare command accessors before evaluation or policy/storage work", async () => {
    const state = fixture();
    const service = new AdminShellService(
      state.req(),
      resolveExtensionManagerOptions(state.options),
    );
    for (const field of ["action", "mode"] as const) {
      let accessed = false;
      const command = Object.defineProperty(state.select(), field, {
        enumerable: true,
        get() {
          accessed = true;
          throw new Error("private accessor must not execute");
        },
      });
      await expect(service.prepare(command, PREPARE_ID)).rejects.toMatchObject({
        code: "INVALID_INPUT",
        status: 400,
      });
      expect(accessed).toBe(false);
    }
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.mutate).not.toHaveBeenCalled();
    expect(mocks.appearanceRead).not.toHaveBeenCalled();
    expect(state.policyReader).not.toHaveBeenCalled();
    expect(state.runtimeReader).not.toHaveBeenCalled();
  });

  it("rejects direct apply planId accessor before evaluation or policy/storage work", async () => {
    const state = fixture();
    const service = new AdminShellService(
      state.req(),
      resolveExtensionManagerOptions(state.options),
    );
    let accessed = false;
    const command = Object.defineProperty(
      { expectedPlanHash: "a".repeat(64) },
      "planId",
      {
        enumerable: true,
        get() {
          accessed = true;
          throw new Error("private accessor must not execute");
        },
      },
    );
    await expect(service.apply(command, APPLY_ID)).rejects.toMatchObject({
      code: "INVALID_INPUT",
      status: 400,
    });
    expect(accessed).toBe(false);
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.mutate).not.toHaveBeenCalled();
    expect(mocks.appearanceRead).not.toHaveBeenCalled();
    expect(state.policyReader).not.toHaveBeenCalled();
    expect(state.runtimeReader).not.toHaveBeenCalled();
  });

  it.each([
    { user: null },
    { user: { id: 17, collection: "users", roles: ["customer"] } },
    { user: { id: 17, collection: "customers", roles: ["admin"] } },
  ])(
    "gates disallowed identity before policy/storage/runtime: %j",
    async ({ user }) => {
      const state = fixture();
      const response = await state.call({
        user,
        path: "/admin-shell/plans",
        method: "post",
        rawBody: "not JSON",
      });
      expect(response.status).toBe(user === null ? 401 : 403);
      expect(mocks.read).not.toHaveBeenCalled();
      expect(mocks.mutate).not.toHaveBeenCalled();
      expect(state.policyReader).not.toHaveBeenCalled();
      expect(state.runtimeReader).not.toHaveBeenCalled();
    },
  );

  it("supports a configured API prefix and validates public snapshot with no cache", async () => {
    const state = fixture("/client/extensions");
    const response = await state.call();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(
      adminShellSnapshotSchema.safeParse((await response.json()).data).success,
    ).toBe(true);
    expect(mocks.read).toHaveBeenCalledWith("fixture:appearance:admin-shell");
    expect(state.runtimeReader).not.toHaveBeenCalled();
  });

  it.each<MalformedRequestCase>([
    { headers: { origin: "https://evil.test" }, expected: 403 },
    { query: "?actorKey=users%3A18", expected: 400 },
    { rawBody: "{bad", expected: 400 },
    { headers: { "content-type": "text/plain" }, expected: 400 },
    {
      rawBody: JSON.stringify({ value: "x".repeat(32768) }),
      headers: { "content-length": "2" },
      expected: 400,
    },
    {
      headers: { "idempotency-key": "00000000-0000-4000-8000-00000000000A" },
      expected: 400,
    },
  ])("refuses malformed POST before storage: %j", async (patch) => {
    const state = fixture();
    const response = await state.call({
      path: "/admin-shell/plans",
      method: "post",
      body: state.select(),
      ...patch,
    });
    expect(response.status).toBe(patch.expected);
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.mutate).not.toHaveBeenCalled();
    expect(state.runtimeReader).not.toHaveBeenCalled();
  });

  it("refuses unknown command fields without publishing actor/scope/body data", async () => {
    const state = fixture();
    const response = await state.call({
      path: "/admin-shell/plans",
      method: "post",
      body: {
        ...state.select(),
        actorKey: "private-actor",
        scopeKey: "private-scope",
      },
    });
    expect(response.status).toBe(400);
    const text = JSON.stringify(await response.json());
    expect(text).not.toContain("private-actor");
    expect(text).not.toContain("private-scope");
    expect(mocks.read).not.toHaveBeenCalled();
  });

  it("native prepare/apply remain independent from a corrupt appearance codec and runtime callback", async () => {
    const state = fixture();
    mocks.appearanceRead.mockRejectedValue(
      new ExtensionAppearanceStorageError("INVALID_STORAGE_STATE"),
    );
    state.runtimeReader.mockRejectedValue(
      new Error("must not read custom runtime"),
    );
    const prepared = await state.call({
      path: "/admin-shell/plans",
      method: "post",
      body: state.select(),
      headers: { origin: "https://trusted.test" },
    });
    expect(prepared.status).toBe(200);
    const prepareResponse = (await prepared.json()).data;
    expect(
      adminShellPrepareResponseSchema.safeParse(prepareResponse).success,
    ).toBe(true);
    expect(prepareResponse.plan.templateBinding).toBeNull();
    expect(mocks.mutate.mock.calls[0][4]).toEqual({
      actorKey: "users:17",
      requestId: PREPARE_ID,
      kind: "prepare",
    });
    const applied = await state.call({
      path: "/admin-shell/apply",
      method: "post",
      body: {
        planId: prepareResponse.plan.planId,
        expectedPlanHash: prepareResponse.plan.planHash,
      },
      headers: { "idempotency-key": APPLY_ID },
    });
    expect(applied.status).toBe(200);
    expect(
      adminShellApplyResponseSchema.safeParse((await applied.json()).data)
        .success,
    ).toBe(true);
    expect(mocks.appearanceRead).not.toHaveBeenCalled();
    expect(state.runtimeReader).not.toHaveBeenCalled();
  });

  it("recovers exact apply outcome after policy drift with the same UUID and rejects changed input", async () => {
    const state = fixture();
    const prepared = (
      await (
        await state.call({
          path: "/admin-shell/plans",
          method: "post",
          body: state.select(),
        })
      ).json()
    ).data.plan;
    const input = {
      planId: prepared.planId,
      expectedPlanHash: prepared.planHash,
    };
    const first = await state.call({
      path: "/admin-shell/apply",
      method: "post",
      body: input,
      headers: { "idempotency-key": APPLY_ID },
    });
    const original = (await first.json()).data;
    state.setPolicy({ ...state.policy(), nativeVersion: "3.89.0" });
    const replay = await state.call({
      path: "/admin-shell/apply",
      method: "post",
      body: input,
      headers: { "idempotency-key": APPLY_ID },
    });
    expect(replay.status).toBe(200);
    expect((await replay.json()).data).toEqual({
      receipt: original.receipt,
      replayed: true,
    });
    expect(state.store()?.state.revision).toBe(1);
    const changed = await state.call({
      path: "/admin-shell/apply",
      method: "post",
      body: { ...input, expectedPlanHash: "0".repeat(64) },
      headers: { "idempotency-key": APPLY_ID },
    });
    expect(changed.status).toBe(409);
    expect(await changed.json()).toMatchObject({
      error: { code: "REPLAY_CONFLICT" },
    });
    const otherActor = await state.call({
      path: "/admin-shell/apply",
      method: "post",
      body: input,
      headers: { "idempotency-key": APPLY_ID },
      user: { id: 18, collection: "users", roles: ["admin"] },
    });
    expect(otherActor.status).toBe(404);
  });

  it("refuses new policy drift with safe DTO errors and rechecks policy after storage wait", async () => {
    const state = fixture();
    const prepared = (
      await (
        await state.call({
          path: "/admin-shell/plans",
          method: "post",
          body: state.select(),
        })
      ).json()
    ).data.plan;
    const applyInput = {
      planId: prepared.planId,
      expectedPlanHash: prepared.planHash,
    };
    state.setPolicy({ ...state.policy(), nativeVersion: "3.89.0" });
    const stale = await state.call({
      path: "/admin-shell/apply",
      method: "post",
      body: applyInput,
      headers: { "idempotency-key": APPLY_ID },
    });
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({
      error: { code: "POLICY_CHANGED" },
    });
    state.setPolicy({ ...state.policy(), nativeVersion: "3.88.0" });
    mocks.mutate.mockImplementationOnce(
      async (...args: Parameters<typeof state.mutate>) => {
        state.setPolicy({ ...state.policy(), nativeVersion: "3.90.0" });
        return state.mutate(...args);
      },
    );
    const raced = await state.call({
      path: "/admin-shell/apply",
      method: "post",
      body: applyInput,
      headers: { "idempotency-key": APPLY_ID },
    });
    expect(raced.status).toBe(409);
    expect(await raced.json()).toMatchObject({
      error: { code: "POLICY_CHANGED" },
    });
    expect(state.store()?.state.revision).toBe(0);
  });

  it("checks actor and expiry on the actual preview operation instead of trusting the query UUID", async () => {
    const state = fixture();
    const plan = (
      await (
        await state.call({
          path: "/admin-shell/plans",
          method: "post",
          body: state.select(),
        })
      ).json()
    ).data.plan;
    const other = await state.call({
      path: "/admin-shell/plans/:id",
      planId: plan.planId,
      user: { id: 18, collection: "users", roles: ["admin"] },
    });
    expect(other.status).toBe(403);
    expect(await other.json()).toMatchObject({
      error: { code: "PLAN_ACTOR_MISMATCH" },
    });
    vi.mocked(Date.now).mockReturnValue(Date.parse(plan.expiresAt));
    const expired = await state.call({
      path: "/admin-shell/plans/:id",
      planId: plan.planId,
    });
    expect(expired.status).toBe(410);
    expect(await expired.json()).toMatchObject({
      error: { code: "PLAN_EXPIRED" },
    });
  });

  it("reports missing schema without mutating or pretending native selection was saved", async () => {
    const state = fixture();
    state.setReady(false);
    const snapshot = await state.call();
    expect(snapshot.status).toBe(200);
    expect((await snapshot.json()).data).toMatchObject({
      storage: "requires_schema",
      state: { revision: 0, current: "template" },
      permissions: { manageShell: true },
    });
    const saved = await state.call({
      path: "/admin-shell/plans",
      method: "post",
      body: state.select(),
    });
    expect(saved.status).toBe(503);
    expect(await saved.json()).toMatchObject({
      error: { code: "SCHEMA_REQUIRED" },
    });
    expect(mocks.mutate).not.toHaveBeenCalled();
  });
});

describe("Real Payload dashboard selector with isolated storage", () => {
  it("uses DefaultDashboard for native and redirects custom to its distinct root", async () => {
    const state = fixture();
    const native = createAdminShellStore(state.policy());
    native.state.current = "native";
    state.setStore(native);
    const result = await SystemAdminDashboard(state.dashboardProps());
    expect(result.type).toBe(mocks.nativeDashboard);
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(state.runtimeReader).not.toHaveBeenCalled();
    state.setStore(createAdminShellStore(state.policy()));
    await expect(SystemAdminDashboard(state.dashboardProps())).rejects.toThrow(
      "redirect:/system",
    );
  });

  it("does not evaluate policy or storage for anonymous/wrong-role dashboard requests", async () => {
    const state = fixture();
    await expect(
      SystemAdminDashboard(state.dashboardProps("", null)),
    ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    await expect(
      SystemAdminDashboard(
        state.dashboardProps("", {
          id: 17,
          collection: "users",
          roles: ["customer"],
        }),
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(state.policyReader).not.toHaveBeenCalled();
    expect(mocks.read).not.toHaveBeenCalled();
    expect(state.runtimeReader).not.toHaveBeenCalled();
  });

  it("native dashboard preview validates the real actor-bound plan and expiry without changing default", async () => {
    const state = fixture();
    const plan = (
      await (
        await state.call({
          path: "/admin-shell/plans",
          method: "post",
          body: state.select(),
        })
      ).json()
    ).data.plan;
    const result = await SystemAdminDashboard(
      state.dashboardProps(`?adminShellPreview=${plan.planId}`),
    );
    const children = result.props.children;
    expect(children[0].type).toBe("aside");
    expect(children[1].type).toBe(mocks.nativeDashboard);
    expect(state.store()?.state.current).toBe("template");
    await expect(
      SystemAdminDashboard(
        state.dashboardProps(`?adminShellPreview=${plan.planId}`, {
          id: 18,
          collection: "users",
          roles: ["admin"],
        }),
      ),
    ).rejects.toThrow("not-found");
    await expect(
      SystemAdminDashboard(
        state.dashboardProps(
          `?adminShellPreview=${plan.planId}&adminShellPreview=${plan.planId}`,
        ),
      ),
    ).rejects.toThrow("not-found");
    vi.mocked(Date.now).mockReturnValue(Date.parse(plan.expiresAt));
    await expect(
      SystemAdminDashboard(
        state.dashboardProps(`?adminShellPreview=${plan.planId}`),
      ),
    ).rejects.toThrow("not-found");
  });

  it.each(["bad-uuid", "", "00000000-0000-4000-8000-00000000000A"])(
    "returns not-found for malformed native preview UUID before storage: %s",
    async (planId) => {
      const state = fixture();
      await expect(
        SystemAdminDashboard(
          state.dashboardProps(`?adminShellPreview=${planId}`),
        ),
      ).rejects.toThrow("not-found");
      expect(mocks.read).not.toHaveBeenCalled();
      expect(state.policyReader).not.toHaveBeenCalled();
    },
  );

  it("recovers native from invalid custom domain while preserving shell pointer and exposing recovery", async () => {
    const state = fixture();
    state.setStore(createAdminShellStore(state.policy()));
    mocks.appearanceRead.mockRejectedValue(
      new ExtensionAppearanceStorageError("INVALID_STORAGE_STATE"),
    );
    const result = await readAdminShellRuntime(
      state.payload as unknown as Payload,
      state.options,
    );
    expect(result).toMatchObject({
      effectiveMode: "native",
      requiresRecovery: true,
      state: { current: "template" },
      fallbackReason: "template_unavailable",
    });
    expect(mocks.mutate).not.toHaveBeenCalled();
    mocks.appearanceRead.mockRejectedValue(
      new ExtensionAppearanceStorageError(),
    );
    await expect(
      readAdminShellRuntime(state.payload as unknown as Payload, state.options),
    ).rejects.toMatchObject({ code: "STORAGE_UNAVAILABLE" });
  });

  it("skips disabled custom runtime during native fallback and does not hide shell corruption", async () => {
    const state = fixture();
    state.setStore(createAdminShellStore(state.policy()));
    state.setPolicy({
      ...state.policy(),
      enabled: { native: true, template: false },
      defaultMode: "native",
      fallbackMode: "native",
    });
    mocks.appearanceRead.mockRejectedValue(
      new ExtensionAppearanceStorageError("INVALID_STORAGE_STATE"),
    );
    state.runtimeReader.mockRejectedValue(
      new Error("must not read disabled custom runtime"),
    );
    const effective = await readAdminShellRuntime(
      state.payload as unknown as Payload,
      state.options,
    );
    expect(effective).toMatchObject({
      state: { current: "template" },
      effectiveMode: "native",
      requiresRecovery: true,
      fallbackReason: "policy_disabled",
    });
    expect(mocks.appearanceRead).not.toHaveBeenCalled();
    expect(state.runtimeReader).not.toHaveBeenCalled();
    mocks.read.mockRejectedValue(
      new ExtensionAppearanceStorageError("INVALID_STORAGE_STATE"),
    );
    await expect(
      readAdminShellRuntime(state.payload as unknown as Payload, state.options),
    ).rejects.toMatchObject({ code: "INVALID_STORAGE_STATE" });
  });
});

describe("native availability proxy and independent deployment flags", () => {
  const loadProxy = async (
    native: string | undefined,
    template: string | undefined,
    mode?: string,
  ) => {
    vi.stubEnv("REALIZE_NATIVE_ADMIN_ENABLED", native);
    vi.stubEnv("REALIZE_TEMPLATE_ADMIN_ENABLED", template);
    vi.stubEnv("REALIZE_DEFAULT_ADMIN_SHELL", mode);
    vi.resetModules();
    return import("../../src/proxy");
  };

  it("blocks disabled native collection UI while preserving native auth and matching no API routes", async () => {
    const { proxy, config } = await loadProxy("false", "true");
    for (const path of [
      "/admin",
      "/admin/collections/users",
      "/admin/analytics/ai",
      "/admin/login-lookalike",
      "/admin/verify-lookalike",
    ]) {
      expect(
        unstable_doesMiddlewareMatch({
          config,
          url: `http://localhost${path}`,
        }),
      ).toBe(true);
      const response = proxy(
        new NextRequest(`http://localhost${path}?secret=remove`),
      );
      expect(response.headers.get("location")).toBe("http://localhost/system");
    }
    for (const path of [
      "/admin/login",
      "/admin/logout",
      "/admin/unauthorized",
      "/admin/forgot",
      "/admin/reset/token",
      "/admin/create-first-user",
      "/admin/verify/token",
    ]) {
      const response = proxy(new NextRequest(`http://localhost${path}`));
      expect(response.headers.get("location")).toBeNull();
      expect(response.headers.get("x-middleware-next")).toBe("1");
    }
    for (const path of [
      "/api/realize-extensions/admin-shell",
      "/api/users/login",
      "/system",
      "/reference/task-manager",
    ])
      expect(
        unstable_doesMiddlewareMatch({
          config,
          url: `http://localhost${path}`,
        }),
      ).toBe(false);
  });

  it("keeps native and template flags independent and uses a valid default for single-shell hosts", async () => {
    const nativeOnly = await loadProxy("true", "false");
    expect(
      nativeOnly
        .proxy(new NextRequest("http://localhost/admin"))
        .headers.get("location"),
    ).toBeNull();
    const config =
      await import("../../src/components/admin/system-shell/adminShellAvailability.config");
    expect(config.adminShellAvailability).toMatchObject({
      enabled: { native: true, template: false },
      defaultMode: "native",
      fallbackMode: "native",
    });
    const both = await loadProxy(undefined, undefined, "native");
    expect(
      both
        .proxy(new NextRequest("http://localhost/admin"))
        .headers.get("location"),
    ).toBeNull();
    const defaults =
      await import("../../src/components/admin/system-shell/adminShellAvailability.config");
    expect(defaults.adminShellAvailability).toMatchObject({
      enabled: { native: true, template: true },
      defaultMode: "native",
    });
  });

  it.each([
    ["false", "false", undefined],
    ["false", "true", "native"],
    ["true", "false", "template"],
    ["unexpected", "true", undefined],
  ])(
    "fails closed for inconsistent deployment flags: %s/%s/%s",
    async (native, template, mode) => {
      await expect(loadProxy(native, template, mode)).rejects.toThrow(
        "ADMIN_SHELL_POLICY_INVALID",
      );
    },
  );
});
