// @vitest-environment node
/**
 * @file tests/int/extension-manager-http.int.spec.ts
 * @version 1.1.0
 * @date 2026-10-12
 * @description Проверяет настоящие HTTP/ACL/DTO границы менеджера с изолированным repository boundary.
 * @see documentation/specifications/extension-management.md
 */
import type { Config, Payload, PayloadRequest } from "payload";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import realizeManifest from "@realize/template-realize/manifest.json";
import settingsSchema from "@realize/template-realize/settings.schema.json";
import { resolveRealizeSettings } from "@realize/template-realize/settings";
import type { ExtensionManagerOptions } from "../../packages/payload-extension-manager/src/ExtensionManagerOptions.types";
import {
  extensionAppearancePlanDtoSchema,
  extensionCatalogDtoSchema,
  ExtensionManagerError,
} from "../../packages/payload-extension-manager/src/extensionManagerContracts.index";
import {
  applyExtensionAppearance,
  createExtensionAppearanceStore,
  createExtensionCatalog,
  prepareExtensionAppearance,
  resolveExtensionAssignment,
} from "../../packages/payload-extension-manager/src/appearance/extensionAppearance.server.index";
import { extensionManagerPlugin } from "../../packages/payload-extension-manager/src/extensionManager.plugin";
import { resolveExtensionManagerOptions } from "../../packages/payload-extension-manager/src/extensionManagerOptions.config";
import { createExtensionManagerEndpoints } from "../../packages/payload-extension-manager/src/server/extensionManagerEndpoints.controller";
import { mapExtensionError } from "../../packages/payload-extension-manager/src/server/mapExtensionError.mapper";
import { readExtensionRuntimeAssignment } from "../../packages/payload-extension-manager/src/server/readExtensionRuntimeAssignment.service";

/** Здесь stub только persistence; service, ACL, stream adapter, pure lifecycle и DTO остаются настоящими. */
const repository = vi.hoisted(() => ({ read: vi.fn(), mutate: vi.fn() }));
vi.mock(
  "../../packages/payload-extension-manager/src/persistence/ExtensionAppearance.repository",
  () => ({
    ExtensionAppearanceRepository: class {
      read = repository.read;
      mutate = repository.mutate;
    },
  }),
);

const NOW = Date.parse("2026-10-12T12:00:00.000Z");
const REQUEST_ID = "00000000-0000-4000-8000-000000000001";
const PLAN_ID = "00000000-0000-4000-8000-000000000002";
const HOST = {
  contractVersion: "1.0" as const,
  platformVersion: "1.0.0",
  reactVersion: "19.2.8",
  nextVersion: "16.3.1",
};
const SELECTION = {
  templateId: "realize",
  templateVersion: "0.1.0",
  target: "admin" as const,
  paletteId: "realize",
  paletteVersion: "0.1.0",
  mode: "light" as const,
};

function fixture() {
  const access = {
    canReadCatalog: vi.fn(() => true),
    canManageAppearance: vi.fn(() => true),
    canInstallCode: vi.fn(() => true),
  };
  const options: ExtensionManagerOptions = {
    userCollection: "users",
    scopeKey: "fixture:appearance",
    catalog: [
      {
        manifest: realizeManifest,
        settingsSchema,
        resolveSettings: resolveRealizeSettings,
      },
    ],
    hostCompatibility: HOST,
    defaultAdmin: { selection: SELECTION, settings: {} },
    access,
  };
  const endpoints = createExtensionManagerEndpoints(
    resolveExtensionManagerOptions(options),
  );
  const payload = {
    config: { csrf: ["https://trusted.test"], serverURL: "http://localhost" },
    jobs: { queue: vi.fn() },
    create: vi.fn(),
    update: vi.fn(),
  };
  const runtime = createExtensionCatalog({
    entries: options.catalog,
    hostCompatibility: HOST,
  });
  const assignInput = {
    action: "assign",
    target: "admin",
    expectedRevision: 0,
    expectedCatalogHash: runtime.catalogHash,
    selection: SELECTION,
    settings: { density: "compact", panelWidth: 320 },
  };
  const installInput = {
    templateId: "realize",
    templateVersion: "0.1.0",
    expectedCatalogHash: runtime.catalogHash,
  };
  const call = async (
    input: {
      path?: string;
      method?: "get" | "post";
      user?: { id: number; collection: string } | null;
      body?: unknown;
      rawBody?: string | Uint8Array | ReadableStream<Uint8Array>;
      headers?: Record<string, string>;
      query?: string;
      planId?: string;
    } = {},
  ) => {
    const path = input.path ?? "";
    const method = input.method ?? "get";
    const endpoint = endpoints.find(
      (item) =>
        item.path === `/realize-extensions${path}` && item.method === method,
    );
    if (!endpoint) throw new Error("Missing fixture endpoint");
    const web = new Request(
      `http://localhost/api/realize-extensions${path}${input.query ?? ""}`,
      {
        method: method.toUpperCase(),
        headers: {
          ...(method === "post"
            ? {
                "content-type": "application/json",
                "idempotency-key": REQUEST_ID,
              }
            : {}),
          ...input.headers,
        },
        ...(method === "post"
          ? { body: input.rawBody ?? JSON.stringify(input.body ?? {}) }
          : {}),
        duplex: "half",
      } as RequestInit,
    );
    const req = Object.assign(web, {
      payload,
      user:
        input.user === undefined ? { id: 17, collection: "users" } : input.user,
      routeParams: { id: input.planId ?? PLAN_ID },
    }) as unknown as PayloadRequest;
    return endpoint.handler(req);
  };
  return {
    options,
    endpoints,
    access,
    payload,
    runtime,
    assignInput,
    installInput,
    call,
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.spyOn(Date, "now").mockReturnValue(NOW);
  repository.read.mockResolvedValue({ store: null, storageReady: true });
  repository.mutate.mockImplementation(
    async (_req, _scope, bootstrap, operation) =>
      (await operation(bootstrap)).result,
  );
});
afterEach(() => vi.restoreAllMocks());

describe("extension manager authenticated HTTP boundary", () => {
  it.each([
    ["", "get"],
    ["/installed-templates", "get"],
    ["/appearance/plans", "post"],
    ["/appearance/plans/:id", "get"],
    ["/appearance/apply", "post"],
    ["/install", "post"],
  ] as const)(
    "refuses anonymous requests before storage or body consumption: %s",
    async (path, method) => {
      const state = fixture();
      const response = await state.call({
        path,
        method,
        user: null,
        rawBody: "not json",
      });
      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({
        ok: false,
        error: { code: "UNAUTHENTICATED" },
      });
      expect(repository.read).not.toHaveBeenCalled();
      expect(repository.mutate).not.toHaveBeenCalled();
      expect(state.payload.jobs.queue).not.toHaveBeenCalled();
    },
  );

  it("refuses foreign auth collections and independent read/manage/install ACL denials", async () => {
    const state = fixture();
    expect(
      (await state.call({ user: { id: 17, collection: "customers" } })).status,
    ).toBe(403);
    expect(state.access.canReadCatalog).not.toHaveBeenCalled();
    state.access.canReadCatalog.mockReturnValue(false);
    state.access.canManageAppearance.mockReturnValue(false);
    state.access.canInstallCode.mockReturnValue(false);
    for (const input of [
      {},
      {
        path: "/appearance/plans",
        method: "post" as const,
        body: state.assignInput,
      },
      { path: "/install", method: "post" as const, body: state.installInput },
    ]) {
      const response = await state.call(input);
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({
        ok: false,
        error: { code: "FORBIDDEN" },
      });
    }
    expect(repository.read).not.toHaveBeenCalled();
    expect(repository.mutate).not.toHaveBeenCalled();
  });

  it("keeps appearance and install access independent for an admitted administrator", async () => {
    const state = fixture();
    state.access.canInstallCode.mockReturnValue(false);
    const prepared = await state.call({
      path: "/appearance/plans",
      method: "post",
      body: state.assignInput,
    });
    expect(prepared.status).toBe(200);
    expect((await prepared.json()).data.replayed).toBe(false);
    expect(
      (
        await state.call({
          path: "/install",
          method: "post",
          body: state.installInput,
        })
      ).status,
    ).toBe(403);
    expect(state.payload.jobs.queue).not.toHaveBeenCalled();
  });

  it("rechecks appearance admission inside the mutation callback before changing state", async () => {
    const state = fixture();
    state.access.canManageAppearance
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false);
    const response = await state.call({
      path: "/appearance/plans",
      method: "post",
      body: state.assignInput,
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: { code: "FORBIDDEN" },
    });
    expect(state.access.canManageAppearance).toHaveBeenCalledTimes(3);
    expect(state.payload.create).not.toHaveBeenCalled();
    expect(state.payload.update).not.toHaveBeenCalled();
  });

  it.each(["?debug=true", "?actorKey=users%3A18", "?requestId=ignored", "?=x"])(
    "refuses every unknown query field: %s",
    async (query) => {
      const state = fixture();
      const response = await state.call({ query });
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        error: { code: "INVALID_REQUEST" },
      });
      expect(repository.read).not.toHaveBeenCalled();
    },
  );

  it.each(["https://evil.test", "null", "http://localhost.evil.test"])(
    "refuses foreign POST Origin before storage: %s",
    async (origin) => {
      const state = fixture();
      const response = await state.call({
        path: "/appearance/plans",
        method: "post",
        body: state.assignInput,
        headers: { origin },
      });
      expect(response.status).toBe(403);
      expect(repository.read).not.toHaveBeenCalled();
      expect(repository.mutate).not.toHaveBeenCalled();
    },
  );

  it.each([undefined, "http://localhost", "https://trusted.test"])(
    "admits configured browser/machine origins while preserving ACL: %s",
    async (origin) => {
      const state = fixture();
      const response = await state.call({
        path: "/appearance/plans",
        method: "post",
        body: state.assignInput,
        headers: origin ? { origin } : {},
      });
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(
        extensionAppearancePlanDtoSchema.safeParse(body.data.plan).success,
      ).toBe(true);
      const mutation = repository.mutate.mock.calls[0];
      expect(mutation[1]).toBe("fixture:appearance");
      expect(mutation[4]).toEqual({
        kind: "prepare",
        actorKey: "users:17",
        requestId: REQUEST_ID,
      });
      expect(JSON.stringify(body)).not.toContain("actorKey");
      expect(JSON.stringify(body)).not.toContain("inputFingerprint");
    },
  );
});

describe("extension manager strict body/idempotency admission", () => {
  it.each([
    ["malformed JSON", "{bad", {}],
    ["trailing JSON", "{} {}", {}],
    ["wrong MIME", "{}", { "content-type": "text/plain" }],
    ["invalid Content-Length", "{}", { "content-length": "-1" }],
    ["declared oversize", "{}", { "content-length": "32769" }],
    [
      "actual oversize without a declaration",
      JSON.stringify({ value: "x".repeat(32768) }),
      {},
    ],
    [
      "actual oversize with false Content-Length",
      JSON.stringify({ value: "x".repeat(32768) }),
      { "content-length": "2" },
    ],
  ])("refuses %s before a mutation", async (_label, rawBody, headers) => {
    const state = fixture();
    const response = await state.call({
      path: "/appearance/plans",
      method: "post",
      rawBody: rawBody as string,
      headers: headers as Record<string, string>,
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: "INVALID_REQUEST" },
    });
    expect(repository.mutate).not.toHaveBeenCalled();
  });

  it("refuses invalid UTF-8 rather than replacing it into a valid-looking setting", async () => {
    const state = fixture();
    const response = await state.call({
      path: "/appearance/plans",
      method: "post",
      rawBody: new Uint8Array([
        0x7b, 0x22, 0x78, 0x22, 0x3a, 0x22, 0xff, 0x22, 0x7d,
      ]),
    });
    expect(response.status).toBe(400);
    expect(repository.mutate).not.toHaveBeenCalled();
  });

  it("cancels a chunked oversize request and closes its reader", async () => {
    const state = fixture();
    const cancel = vi.fn();
    const rawBody = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(20000));
        controller.enqueue(new Uint8Array(20000));
      },
      cancel,
    });
    expect(
      (await state.call({ path: "/appearance/plans", method: "post", rawBody }))
        .status,
    ).toBe(400);
    expect(cancel).toHaveBeenCalledOnce();
    expect(rawBody.locked).toBe(false);
    expect(repository.mutate).not.toHaveBeenCalled();
  });

  it.each([
    "",
    "arbitrary",
    "00000000-0000-4000-8000-00000000000A",
    `${REQUEST_ID}, ${REQUEST_ID}`,
  ])(
    "requires a single canonical UUID Idempotency-Key: %s",
    async (requestId) => {
      const state = fixture();
      const response = await state.call({
        path: "/appearance/plans",
        method: "post",
        body: state.assignInput,
        headers: { "idempotency-key": requestId },
      });
      expect(response.status).toBe(400);
      expect(repository.read).not.toHaveBeenCalled();
      expect(repository.mutate).not.toHaveBeenCalled();
    },
  );

  it("refuses client actor/scope fields without returning their private values", async () => {
    const state = fixture();
    const response = await state.call({
      path: "/appearance/plans",
      method: "post",
      body: {
        ...state.assignInput,
        actorKey: "private-actor",
        scopeKey: "private-realm",
      },
    });
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    expect(JSON.stringify(body)).not.toContain("private-actor");
    expect(JSON.stringify(body)).not.toContain("private-realm");
  });
});

describe("extension manager readiness, installer and DTO safety", () => {
  it("distinguishes schema readiness from ACL and refuses save before storage mutation", async () => {
    const state = fixture();
    repository.read.mockResolvedValue({ store: null, storageReady: false });
    const snapshot = await state.call();
    expect(snapshot.status).toBe(200);
    expect((await snapshot.json()).data).toMatchObject({
      storage: "requires_schema",
      permissions: { manageAppearance: true },
      targets: { frontend: { current: null, revision: 0 } },
      codeInstallation: { ready: false },
    });
    const response = await state.call({
      path: "/appearance/plans",
      method: "post",
      body: state.assignInput,
    });
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      error: { code: "SCHEMA_REQUIRED" },
    });
    expect(repository.mutate).not.toHaveBeenCalled();
  });

  it("returns public catalog/history DTOs and explicit non-cacheable response headers", async () => {
    const state = fixture();
    const prepared = prepareExtensionAppearance({
      store: createExtensionAppearanceStore(),
      catalog: state.runtime,
      actorKey: "users:17",
      requestId: REQUEST_ID,
      planId: PLAN_ID,
      input: state.assignInput,
      nowMs: NOW,
    });
    const applied = applyExtensionAppearance({
      store: prepared.store,
      catalog: state.runtime,
      actorKey: "users:17",
      requestId: "00000000-0000-4000-8000-000000000003",
      input: { planId: PLAN_ID, expectedPlanHash: prepared.plan.planHash },
      nowMs: NOW + 1,
    });
    repository.read.mockResolvedValue({
      store: applied.store,
      storageReady: true,
    });
    const response = await state.call();
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    const body = await response.json();
    expect(extensionCatalogDtoSchema.safeParse(body.data.catalog).success).toBe(
      true,
    );
    expect(body.data.history).toHaveLength(1);
    expect(body.data.history[0]).toMatchObject({
      appliedRevision: 1,
      planId: PLAN_ID,
    });
    for (const privateKey of [
      "actorKey",
      "requestId",
      "inputFingerprint",
      "resolveSettings",
      "stateHash",
    ])
      expect(JSON.stringify(body)).not.toContain(privateKey);
  });

  it("refuses code installation without creating jobs, receipts or state writes", async () => {
    const state = fixture();
    const response = await state.call({
      path: "/install",
      method: "post",
      body: state.installInput,
    });
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { code: "DELIVERY_ADAPTER_UNAVAILABLE" },
    });
    expect(state.payload.jobs.queue).not.toHaveBeenCalled();
    expect(state.payload.create).not.toHaveBeenCalled();
    expect(state.payload.update).not.toHaveBeenCalled();
    expect(repository.mutate).not.toHaveBeenCalled();
    expect(repository.read).not.toHaveBeenCalled();
  });

  it("requires strict installer input even while delivery is unavailable", async () => {
    const state = fixture();
    const response = await state.call({
      path: "/install",
      method: "post",
      body: { ...state.installInput, code: "execute-this" },
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: "INVALID_REQUEST" },
    });
    expect(state.payload.jobs.queue).not.toHaveBeenCalled();
  });

  it("sanitizes unknown storage errors while retaining known CAS status/code", async () => {
    const state = fixture();
    repository.read.mockRejectedValue(
      new Error("private database connection material"),
    );
    const response = await state.call();
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body).toMatchObject({
      ok: false,
      error: { code: "STORAGE_UNAVAILABLE" },
    });
    expect(JSON.stringify(body)).not.toContain(
      "private database connection material",
    );
    expect(body.error).not.toHaveProperty("stack");
    expect(
      mapExtensionError(new ExtensionManagerError("REVISION_CONFLICT")),
    ).toMatchObject({ status: 409, error: { code: "REVISION_CONFLICT" } });
  });
});

describe("extension manager plugin namespace ownership", () => {
  it("preserves existing config and refuses collection/endpoint namespace collisions", async () => {
    const state = fixture();
    const plugin = extensionManagerPlugin(state.options);
    const base = {
      collections: [{ slug: "users", auth: true, fields: [] }],
      endpoints: [
        {
          path: "/unrelated",
          method: "get",
          handler: async () => Response.json({ ok: true }),
        },
      ],
      custom: { marker: "preserve" },
    } as unknown as Config;
    const result = await plugin(base);
    expect(result.custom).toEqual({ marker: "preserve" });
    expect(result.collections?.[0]).toBe(base.collections?.[0]);
    expect(result.endpoints?.[0]).toBe(base.endpoints?.[0]);
    expect(() =>
      plugin({
        ...base,
        collections: [
          ...(base.collections ?? []),
          { slug: "realize-extension-manager-state", fields: [] },
        ],
      }),
    ).toThrow();
    expect(() =>
      plugin({
        ...base,
        endpoints: [
          {
            path: "/realize-extensions",
            method: "get",
            handler: async () => Response.json({}),
          },
        ],
      }),
    ).toThrow();
  });

  it("refuses a missing or non-auth collection instead of accepting an invalid identity owner", () => {
    const state = fixture();
    const plugin = extensionManagerPlugin(state.options);
    expect(() => plugin({ collections: [] } as unknown as Config)).toThrow();
    expect(() =>
      plugin({
        collections: [{ slug: "users", fields: [], auth: false }],
      } as unknown as Config),
    ).toThrow();
  });
});

describe("server runtime assignment selection without writes", () => {
  it("keeps an explicit source fallback available when persistence schema is missing", async () => {
    const state = fixture();
    repository.read.mockResolvedValue({ store: null, storageReady: false });
    const effective = await readExtensionRuntimeAssignment(
      state.payload as unknown as Payload,
      state.options,
      "admin",
    );
    expect(effective).toMatchObject({
      revision: 0,
      persisted: false,
      storageReady: false,
      requiresRecovery: false,
      assignment: {
        selection: SELECTION,
        settings: { density: "comfortable", panelWidth: 280 },
      },
    });
    expect(repository.mutate).not.toHaveBeenCalled();
    expect(state.payload.create).not.toHaveBeenCalled();
    const frontend = await readExtensionRuntimeAssignment(
      state.payload as unknown as Payload,
      state.options,
      "frontend",
    );
    expect(frontend.assignment).toBeNull();
  });

  it("returns a compatible persisted exact assignment and revision without changing storage", async () => {
    const state = fixture();
    const assignment = resolveExtensionAssignment({
      catalog: state.runtime,
      target: "admin",
      selection: SELECTION,
      settings: { density: "compact", panelWidth: 360 },
    });
    const store = createExtensionAppearanceStore({ admin: assignment });
    store.targets.admin.revision = 7;
    const original = structuredClone(store);
    repository.read.mockResolvedValue({ store, storageReady: true });
    const effective = await readExtensionRuntimeAssignment(
      state.payload as unknown as Payload,
      state.options,
      "admin",
    );
    expect(effective).toEqual({
      assignment,
      revision: 7,
      persisted: true,
      storageReady: true,
      requiresRecovery: false,
    });
    expect(store).toEqual(original);
    expect(repository.mutate).not.toHaveBeenCalled();
    expect(state.payload.update).not.toHaveBeenCalled();
  });

  it.each([
    "missing version",
    "missing palette",
    "changed manifest",
    "invalid settings",
    "normalization drift",
  ])(
    "uses source fallback and flags recovery for %s instead of silently altering persisted settings",
    async (reason) => {
      const state = fixture();
      const assignment = resolveExtensionAssignment({
        catalog: state.runtime,
        target: "admin",
        selection: SELECTION,
        settings: { density: "compact", panelWidth: 360 },
      });
      if (reason === "missing version")
        assignment.selection.templateVersion = "0.2.0";
      if (reason === "missing palette")
        assignment.selection.paletteVersion = "0.2.0";
      if (reason === "changed manifest")
        assignment.manifestHash = "0".repeat(64);
      if (reason === "invalid settings")
        assignment.settings = { density: "compact", panelWidth: 401 };
      if (reason === "normalization drift") assignment.settings = {};
      const store = createExtensionAppearanceStore({ admin: assignment });
      store.targets.admin.revision = 7;
      const original = structuredClone(store);
      repository.read.mockResolvedValue({ store, storageReady: true });
      const effective = await readExtensionRuntimeAssignment(
        state.payload as unknown as Payload,
        state.options,
        "admin",
      );
      expect(effective).toMatchObject({
        revision: 7,
        persisted: true,
        storageReady: true,
        requiresRecovery: true,
        assignment: { settings: { density: "comfortable", panelWidth: 280 } },
      });
      expect(effective.assignment).not.toEqual(assignment);
      expect(store).toEqual(original);
      expect(repository.mutate).not.toHaveBeenCalled();
      expect(state.payload.create).not.toHaveBeenCalled();
      expect(state.payload.update).not.toHaveBeenCalled();
    },
  );
});
