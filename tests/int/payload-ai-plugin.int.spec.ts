/**
 * @file tests/int/payload-ai-plugin.int.spec.ts
 * @version 1.4.0
 * @date 2026-09-11
 * @description Проверяет регистрацию и доступ к разделам конфигурации и интеграций Payload.
 */

import type { Config, PayloadRequest } from "payload";
import { describe, expect, it, vi } from "vitest";

import { realizeAIPlugin } from "@realize/payload-ai-control";
import type { AgentLayerViewProps } from "../../packages/payload-ai-plugin/src/admin/agent-layer-settings/AgentLayerView.types";
import { loadAgentLayerView } from "../../packages/payload-ai-plugin/src/admin/agent-layer-settings/loadAgentLayerView.service";
import type { IntegrationsViewProps } from "../../packages/payload-ai-plugin/src/admin/integrations/IntegrationsView.types";
import { loadIntegrationsView } from "../../packages/payload-ai-plugin/src/admin/integrations/loadIntegrationsView.service";
import {
  requireAIConfigurationManager,
  requireDataManager,
  requireIntegrationManager,
  requireReleaseApprover,
} from "../../packages/payload-ai-plugin/src/endpoints/access";
import { loadWorkflowRunsView } from "../../packages/payload-ai-plugin/src/admin/workflow-runs/loadWorkflowRunsView.service";
import type { WorkflowRunsViewProps } from "../../packages/payload-ai-plugin/src/admin/workflow-runs/WorkflowRunsView.types";
import { sanitizeOptions } from "../../packages/payload-ai-plugin/src/options";

vi.mock("next/navigation.js", () => ({
  notFound: () => {
    throw new Error("NEXT_HTTP_ERROR_FALLBACK;404");
  },
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT;${url}`);
  },
}));

const options = {
  access: {
    canApproveRelease: () => true,
    canManageAIConfiguration: () => true,
    canManageData: () => true,
    canManageIntegrations: () => true,
    canUseChat: () => true,
    canViewRuns: () => true,
  },
  enabled: false,
  runtime: {
    controlPlaneTokenEnv: "REALIZE_AI_CONTROL_PLANE_TOKEN",
    controlPlaneURL: "http://127.0.0.1:43120",
    mode: "local-development" as const,
  },
};

const baseConfig = (): Config =>
  ({
    admin: {
      components: {
        beforeNavLinks: ["./existing-nav"],
        providers: ["./existing-provider"],
        views: {
          existing: {
            Component: "./existing-view",
            path: "/existing",
          },
        },
      },
    },
    collections: [{ fields: [], slug: "existing" }],
    custom: { existing: "preserved" },
    endpoints: [
      {
        handler: async () => Response.json({ ok: true }),
        method: "get",
        path: "/existing",
      },
    ],
  }) as unknown as Config;

const integrationViewProps = (
  mode: IntegrationsViewProps["mode"],
): IntegrationsViewProps =>
  ({
    initPageResult: { req: { user: { id: 42 } } },
    integrationsRoute: "/tools/connections",
    mode,
    params: { segments: ["tools", "connections", "github"] },
    payload: {
      config: {
        admin: { routes: { login: "/login", unauthorized: "/unauthorized" } },
        custom: {
          realizeAIControl: {
            canManageIntegrations: () => true,
            integrationEncryptionKeyEnv: "REALIZE_TEST_INTEGRATION_VIEW_KEY",
          },
        },
        routes: { admin: "/control" },
      },
      db: { defaultIDType: "number" },
      find: vi.fn().mockResolvedValue({ docs: [], totalDocs: 0 }),
    },
  }) as unknown as IntegrationsViewProps;

describe("integration Admin views", () => {
  it("resolves settings from Payload catch-all segments and custom base routes", async () => {
    const props = integrationViewProps("settings");
    const result = await loadIntegrationsView(props);

    expect(result.catalogURL).toBe("/control/tools/connections");
    expect(result.providerID).toBe("github");
    expect(result.initialCatalog.connections).toEqual([]);
    for (const connectionKey of ["github:primary", "codex:primary"]) {
      expect(props.payload.find).toHaveBeenCalledWith(
        expect.objectContaining({
          collection: "realize-ai-integrations",
          where: { connectionKey: { equals: connectionKey } },
        }),
      );
    }
  });

  it("renders the catalog without selecting a provider", async () => {
    const props = integrationViewProps("catalog");
    const result = await loadIntegrationsView(props);

    expect(result.providerID).toBeUndefined();
    expect(result.catalogURL).toBe("/control/tools/connections");
  });

  it("rejects unknown providers before reading integrations", async () => {
    const props = integrationViewProps("settings");
    const unknownProviderProps = {
      ...props,
      params: { segments: ["tools", "connections", "unknown"] },
    };

    await expect(loadIntegrationsView(unknownProviderProps)).rejects.toThrow(
      "NEXT_HTTP_ERROR_FALLBACK;404",
    );
    expect(props.payload.find).not.toHaveBeenCalled();
  });

  it.each(["catalog", "settings"] as const)(
    "authorizes the %s view before accessing connections",
    async (mode) => {
      const props = integrationViewProps(mode);
      props.initPageResult.req.user = null;

      await expect(loadIntegrationsView(props)).rejects.toThrow(
        "NEXT_REDIRECT;/control/login",
      );
      expect(props.payload.find).not.toHaveBeenCalled();

      props.initPageResult.req.user = { id: 42 } as PayloadRequest["user"];
      props.payload.config.custom!.realizeAIControl = {
        canManageIntegrations: () => false,
      };

      await expect(loadIntegrationsView(props)).rejects.toThrow(
        "NEXT_REDIRECT;/control/unauthorized",
      );
      expect(props.payload.find).not.toHaveBeenCalled();
    },
  );
});

describe("agent layer Admin view", () => {
  it("uses the configuration permission and the configured Admin base route", async () => {
    const props = {
      ...integrationViewProps("catalog"),
      settingsRoute: "/tools/agents/settings",
    } as unknown as AgentLayerViewProps;
    const permission = vi.fn().mockResolvedValue(true);
    props.payload.config.custom!.realizeAIControl = {
      canManageAIConfiguration: permission,
      canManageIntegrations: () => false,
    };

    await expect(loadAgentLayerView(props)).resolves.toEqual({
      settingsURL: "/control/tools/agents/settings",
    });
    expect(permission).toHaveBeenCalledWith({ req: props.initPageResult.req });

    permission.mockResolvedValue(false);
    await expect(loadAgentLayerView(props)).rejects.toThrow(
      "NEXT_REDIRECT;/control/unauthorized",
    );

    props.initPageResult.req.user = null;
    permission.mockClear();
    await expect(loadAgentLayerView(props)).rejects.toThrow(
      "NEXT_REDIRECT;/control/login",
    );
    expect(permission).not.toHaveBeenCalled();
    expect(props.payload.find).not.toHaveBeenCalled();
  });

  it("derives its exact route from the plugin route", async () => {
    const transformed = await realizeAIPlugin({
      ...options,
      admin: { route: "/tools/agents" },
    })(baseConfig());

    expect(transformed.admin?.components?.views).toMatchObject({
      realizeAgentLayerSettings: {
        Component: { serverProps: { settingsRoute: "/tools/agents/settings" } },
        exact: true,
        path: "/tools/agents/settings",
      },
    });
  });

  it.each(["/tools/settings", "/tools/settings/"] as const)(
    "rejects an integration catalog shadowing settings at %s",
    (integrationsRoute) => {
      expect(() =>
        realizeAIPlugin({
          ...options,
          admin: { integrationsRoute, route: "/tools" },
        })(baseConfig()),
      ).toThrow("Realize Admin route collision");
    },
  );

  it("does not overwrite an incoming view using the new reserved key", () => {
    const config = baseConfig();
    config.admin!.components!.views = {
      realizeAgentLayerSettings: {
        Component: "./custom-settings",
        path: "/custom-settings",
      },
    };
    expect(() => realizeAIPlugin(options)(config)).toThrow(
      "Realize Admin view key collision: realizeAgentLayerSettings",
    );
  });
});

describe("realizeAIPlugin", () => {
  it("preserves incoming config and installs the disabled schema", async () => {
    const transformed = await realizeAIPlugin(options)(baseConfig());
    const slugs = transformed.collections?.map((collection) => collection.slug);
    const components = transformed.admin?.components;
    const views = components?.views as
      Record<string, { path?: string }> | undefined;

    expect(slugs).toEqual([
      "existing",
      "realize-ai-conversations",
      "realize-ai-messages",
      "realize-ai-chat-attachments",
      "realize-ai-change-requests",
      "realize-ai-approvals",
      "realize-ai-data-operations",
      "realize-ai-data-operation-approvals",
      "realize-ai-data-operation-events",
      "realize-ai-config-drafts",
      "realize-ai-config-releases",
      "realize-ai-active-config-pointers",
      "realize-ai-config-events",
      "realize-ai-execution-jobs",
      "realize-ai-worker-presence",
      "realize-ai-deployments",
      "realize-ai-release-candidates",
      "realize-ai-source-promotions",
      "realize-ai-integrations",
      "realize-ai-integration-events",
      "realize-ai-check-results",
      "realize-ai-runs",
      "realize-ai-run-events",
    ]);
    expect(components?.beforeNavLinks).toHaveLength(2);
    expect(components?.providers).toHaveLength(2);
    expect(components?.providers?.[0]).toBe("./existing-provider");
    expect(components?.providers?.[1]).toEqual(
      expect.objectContaining({
        path: "@realize/payload-ai-control/provider#RealizeAIProvider",
      }),
    );
    expect(views?.existing?.path).toBe("/existing");
    expect(views?.realizeAI?.path).toBe("/ai");
    expect(views?.realizeAgentLayerSettings?.path).toBe("/ai/settings");
    expect(views?.realizeIntegrations?.path).toBe("/integrations");
    expect(views?.realizeIntegrationSettings?.path).toBe(
      "/integrations/:provider",
    );
    expect(transformed.custom?.existing).toBe("preserved");
    expect(transformed.custom?.realizeAIControl).toMatchObject({
      canManageAIConfiguration: options.access.canManageAIConfiguration,
      canManageIntegrations: options.access.canManageIntegrations,
      integrationEncryptionKeyEnv: "REALIZE_INTEGRATIONS_ENCRYPTION_KEY",
    });
    expect(transformed.endpoints?.[0]?.path).toBe("/existing");
    expect(transformed.endpoints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: "get",
          path: "/realize-ai/chat/settings",
        }),
        expect.objectContaining({
          method: "put",
          path: "/realize-ai/integrations/codex/chat-settings",
        }),
      ]),
    );
    const endpointKeys = transformed.endpoints?.map(
      ({ method, path }) => `${method}:${path}`,
    );
    expect(new Set(endpointKeys).size).toBe(endpointKeys?.length);
    const conversations = transformed.collections?.find(
      (collection) => collection.slug === "realize-ai-conversations",
    );
    expect(conversations?.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "idempotencyKey",
          required: true,
          unique: true,
        }),
      ]),
    );
    expect(await conversations?.access?.read?.({} as never)).toBe(false);
    const integrations = transformed.collections?.find(
      (collection) => collection.slug === "realize-ai-integrations",
    );
    expect(await integrations?.access?.read?.({} as never)).toBe(false);
    expect(integrations?.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "provider", type: "text" }),
        expect.objectContaining({ name: "credentialEnvelope" }),
      ]),
    );
    const changeRequests = transformed.collections?.find(
      (collection) => collection.slug === "realize-ai-change-requests",
    );
    expect(changeRequests?.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "planHash", required: true }),
        expect.objectContaining({ name: "scopeHash", required: true }),
        expect.objectContaining({ name: "sourceMessageKey", unique: true }),
      ]),
    );
    const dataOperations = transformed.collections?.find(
      (collection) => collection.slug === "realize-ai-data-operations",
    );
    expect(dataOperations?.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "operationHash", required: true }),
        expect.objectContaining({ name: "rollbackHash", required: true }),
        expect.objectContaining({ name: "beforeSnapshot", type: "json" }),
        expect.objectContaining({ name: "sourceMessageKey", unique: true }),
      ]),
    );
    expect(
      transformed.collections?.find(
        (collection) => collection.slug === "realize-ai-data-operation-events",
      )?.fields,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "deliveryStatus" }),
        expect.objectContaining({ name: "idempotencyKey", unique: true }),
      ]),
    );
    expect(
      transformed.endpoints?.some(
        (endpoint) =>
          endpoint.method === "post" &&
          endpoint.path === "/realize-ai/config/validate",
      ),
    ).toBe(true);
    expect(
      transformed.endpoints?.some(
        (endpoint) =>
          endpoint.method === "post" &&
          endpoint.path === "/realize-ai/config/releases",
      ),
    ).toBe(true);
    expect(
      transformed.endpoints?.some(
        (endpoint) =>
          endpoint.method === "post" &&
          endpoint.path === "/realize-ai/conversations/:id/data-operations",
      ),
    ).toBe(true);
    expect(
      transformed.endpoints?.some(
        (endpoint) =>
          endpoint.method === "post" &&
          endpoint.path === "/realize-ai/data-operations/:id/apply",
      ),
    ).toBe(true);
    expect(
      transformed.endpoints?.some(
        (endpoint) =>
          endpoint.method === "post" &&
          endpoint.path === "/realize-ai/data-operations/:id/rollback",
      ),
    ).toBe(true);
    expect(
      transformed.endpoints?.some(
        (endpoint) =>
          endpoint.method === "post" &&
          endpoint.path === "/realize-ai/changes/:id/approve-plan",
      ),
    ).toBe(true);
    expect(
      transformed.endpoints?.some(
        (endpoint) =>
          endpoint.method === "post" &&
          endpoint.path === "/realize-ai/changes/:id/publish-pull-request",
      ),
    ).toBe(true);
    expect(
      transformed.endpoints?.some(
        (endpoint) =>
          endpoint.method === "get" &&
          endpoint.path === "/realize-ai/source-promotions/:id",
      ),
    ).toBe(true);
    expect(
      transformed.endpoints?.some(
        (endpoint) =>
          endpoint.method === "put" &&
          endpoint.path === "/realize-ai/integrations/github",
      ),
    ).toBe(true);
    expect(
      transformed.endpoints?.some(
        (endpoint) =>
          endpoint.method === "post" &&
          endpoint.path === "/realize-ai/changes/:id/prepare-release",
      ),
    ).toBe(true);
    expect(
      transformed.endpoints?.some(
        (endpoint) =>
          endpoint.method === "post" &&
          endpoint.path === "/realize-ai/changes/:id/approve-release",
      ),
    ).toBe(true);
    expect(
      transformed.endpoints?.some(
        (endpoint) =>
          endpoint.method === "get" &&
          endpoint.path === "/realize-ai/deployments/:id",
      ),
    ).toBe(true);
    expect(
      transformed.endpoints?.some(
        (endpoint) =>
          endpoint.method === "post" &&
          endpoint.path === "/realize-ai/changes/:id/deploy-preview",
      ),
    ).toBe(true);
    expect(
      transformed.endpoints?.some(
        (endpoint) =>
          endpoint.method === "post" &&
          endpoint.path === "/realize-ai/changes/:id/execute",
      ),
    ).toBe(true);
  });

  it.each(["/integrations", "/tools/connections", "/tools/connections/"])(
    "registers separate exact catalog and settings views under %s",
    async (integrationsRoute) => {
      const config = baseConfig();
      config.routes = { admin: "/control" };
      const transformed = await realizeAIPlugin({
        ...options,
        admin: { integrationsRoute: integrationsRoute as `/${string}` },
      })(config);

      expect(transformed.routes?.admin).toBe("/control");
      expect(transformed.admin?.components?.views).toMatchObject({
        realizeIntegrations: {
          Component: {
            serverProps: { integrationsRoute, mode: "catalog" },
          },
          exact: true,
          path: integrationsRoute,
        },
        realizeIntegrationSettings: {
          Component: {
            serverProps: { integrationsRoute, mode: "settings" },
          },
          exact: true,
          path: `${integrationsRoute.replace(/\/$/, "")}/:provider`,
        },
      });
    },
  );

  it("fails closed on collection, route and endpoint collisions", () => {
    const collectionCollision = baseConfig();
    collectionCollision.collections = [
      ...(collectionCollision.collections || []),
      { fields: [], slug: "realize-ai-runs" },
    ];
    expect(() => realizeAIPlugin(options)(collectionCollision)).toThrow(
      "Realize AI collection slug collision",
    );

    const routeCollision = baseConfig();
    routeCollision.admin!.components!.views = {
      conflict: { Component: "./conflict", path: "/ai" },
    };
    expect(() => realizeAIPlugin(options)(routeCollision)).toThrow(
      "Realize Admin route collision",
    );

    const integrationSettingsCollision = baseConfig();
    integrationSettingsCollision.admin!.components!.views = {
      conflict: {
        Component: "./conflict",
        path: "/integrations/:provider",
      },
    };
    expect(() =>
      realizeAIPlugin(options)(integrationSettingsCollision),
    ).toThrow("Realize Admin route collision: /integrations/:provider");

    const agentLayerCollision = baseConfig();
    agentLayerCollision.admin!.components!.views = {
      conflict: { Component: "./conflict", path: "/ai/settings" },
    };
    expect(() => realizeAIPlugin(options)(agentLayerCollision)).toThrow(
      "Realize Admin route collision: /ai/settings",
    );

    const endpointCollision = baseConfig();
    endpointCollision.endpoints = [
      {
        handler: async () => Response.json({ ok: true }),
        method: "get",
        path: "/realize-ai/status",
      },
    ];
    expect(() => realizeAIPlugin(options)(endpointCollision)).toThrow(
      "Realize AI endpoint collision",
    );

    const customCollision = baseConfig();
    customCollision.custom = { realizeAIControl: {} };
    expect(() => realizeAIPlugin(options)(customCollision)).toThrow(
      "Realize AI config.custom collision",
    );
  });

  it("rejects non-loopback local control planes", () => {
    expect(() =>
      realizeAIPlugin({
        ...options,
        runtime: {
          ...options.runtime,
          controlPlaneURL: "http://control-plane.internal:43120",
        },
      }),
    ).toThrow("Local-development control plane must use a loopback URL.");
  });

  it("does not let ordinary chat access bypass the release-approver gate", async () => {
    const req = { user: { id: 42 } } as unknown as PayloadRequest;
    const denied = sanitizeOptions({
      ...options,
      access: {
        ...options.access,
        canApproveRelease: () => false,
      },
    });
    await expect(requireReleaseApprover(req, denied)).rejects.toMatchObject({
      code: "FORBIDDEN",
      status: 403,
    });

    await expect(
      requireReleaseApprover(req, sanitizeOptions(options)),
    ).resolves.toBe(req.user);
  });

  it("keeps integration-secret management behind a separate permission", async () => {
    const req = { user: { id: 42 } } as unknown as PayloadRequest;
    const denied = sanitizeOptions({
      ...options,
      access: {
        ...options.access,
        canManageIntegrations: () => false,
      },
    });
    await expect(requireIntegrationManager(req, denied)).rejects.toMatchObject({
      code: "FORBIDDEN",
      status: 403,
    });
  });

  it("keeps installation configuration behind a separate permission", async () => {
    const req = { user: { id: 42 } } as unknown as PayloadRequest;
    const denied = sanitizeOptions({
      ...options,
      access: {
        ...options.access,
        canManageAIConfiguration: () => false,
      },
    });
    await expect(
      requireAIConfigurationManager(req, denied),
    ).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
  });

  it("keeps Payload data writes behind a separate permission", async () => {
    const req = { user: { id: 42 } } as unknown as PayloadRequest;
    const denied = sanitizeOptions({
      ...options,
      access: {
        ...options.access,
        canManageData: () => false,
      },
    });
    await expect(requireDataManager(req, denied)).rejects.toMatchObject({
      code: "FORBIDDEN",
      status: 403,
    });
    await expect(
      requireDataManager(req, sanitizeOptions(options)),
    ).resolves.toBe(req.user);
  });
});

describe("workflow registry Admin views", () => {
  it("registers exact list and detail routes under a custom AI route", async () => {
    const result = await realizeAIPlugin({
      ...options,
      admin: { route: "/tools/assist" },
    })(baseConfig());
    expect(result.admin?.components?.views).toMatchObject({
      realizeWorkflowRuns: {
        exact: true,
        path: "/tools/assist/runs",
        Component: {
          serverProps: {
            runsRoute: "/tools/assist/runs",
            chatRoute: "/tools/assist",
            mode: "list",
          },
        },
      },
      realizeWorkflowRun: {
        exact: true,
        path: "/tools/assist/runs/:rootRunID",
        Component: { serverProps: { mode: "detail" } },
      },
    });
  });
  it.each(["realizeWorkflowRuns", "realizeWorkflowRun"])(
    "rejects a reserved view key %s",
    (key) => {
      const config = baseConfig();
      config.admin!.components!.views = {
        [key]: { Component: "./existing", path: "/existing" },
      };
      expect(() => realizeAIPlugin(options)(config)).toThrow(
        `Realize Admin view key collision: ${key}`,
      );
    },
  );
  it.each(["/ai/runs", "/ai/runs/:rootRunID"] as const)(
    "rejects an existing route %s",
    (path) => {
      const config = baseConfig();
      config.admin!.components!.views = {
        existing: { Component: "./existing", path },
      };
      expect(() => realizeAIPlugin(options)(config)).toThrow(
        `Realize Admin route collision: ${path}`,
      );
    },
  );
  it("formats all links under the actual admin base and guards unauthenticated access", () => {
    const props = {
      ...integrationViewProps("catalog"),
      mode: "detail",
      runsRoute: "/tools/assist/runs",
      chatRoute: "/tools/assist",
      settingsRoute: "/tools/assist/settings",
      params: { segments: ["tools", "assist", "runs", "42"] },
    } as unknown as WorkflowRunsViewProps;
    props.initPageResult.req.user = { id: 1, roles: ["admin"] } as never;
    expect(loadWorkflowRunsView(props)).toEqual({
      runsURL: "/control/tools/assist/runs",
      chatURL: "/control/tools/assist",
      settingsURL: "/control/tools/assist/settings",
      rootRunID: "42",
    });
    props.initPageResult.req.user = null;
    expect(() => loadWorkflowRunsView(props)).toThrow(
      "NEXT_REDIRECT;/control/login",
    );
    props.initPageResult.req.user = { id: 2, roles: ["customer"] } as never;
    expect(() => loadWorkflowRunsView(props)).toThrow(
      "NEXT_REDIRECT;/control/unauthorized",
    );
  });
});
