/**
 * @file tests/int/payload-ai-plugin.int.spec.ts
 * @version 2026-08-21
 * @description Verifies that the AI plugin transformer composes with Payload configuration.
 */

import type { Config } from "payload";
import { describe, expect, it } from "vitest";

import { realizeAIPlugin } from "@realize/payload-ai-control";

const options = {
  access: {
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
      "realize-ai-execution-jobs",
      "realize-ai-deployments",
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
    expect(transformed.endpoints?.[0]?.path).toBe("/existing");
    expect(transformed.endpoints).toHaveLength(21);
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
      "Realize AI admin route collision",
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
});
