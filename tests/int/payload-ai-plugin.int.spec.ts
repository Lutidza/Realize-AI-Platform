/**
 * @file tests/int/payload-ai-plugin.int.spec.ts
 * @version 2026-09-02
 * @description Проверяет AI config, source/release и integration Payload transformer.
 */

import type { Config, PayloadRequest } from "payload";
import { describe, expect, it } from "vitest";

import { realizeAIPlugin } from "@realize/payload-ai-control";
import {
  requireAIConfigurationManager,
  requireDataManager,
  requireIntegrationManager,
  requireReleaseApprover,
} from "../../packages/payload-ai-plugin/src/endpoints/access";
import { sanitizeOptions } from "../../packages/payload-ai-plugin/src/options";

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
    expect(views?.realizeIntegrations?.path).toBe("/integrations");
    expect(transformed.custom?.existing).toBe("preserved");
    expect(transformed.custom?.realizeAIControl).toMatchObject({
      canManageAIConfiguration: options.access.canManageAIConfiguration,
      canManageIntegrations: options.access.canManageIntegrations,
      integrationEncryptionKeyEnv: "REALIZE_INTEGRATIONS_ENCRYPTION_KEY",
    });
    expect(transformed.endpoints?.[0]?.path).toBe("/existing");
    expect(transformed.endpoints).toHaveLength(45);
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
