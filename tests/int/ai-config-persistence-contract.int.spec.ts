/**
 * @file tests/int/ai-config-persistence-contract.int.spec.ts
 * @version 1.0.0
 * @date 2026-09-10
 * @description Проверяет hidden Payload schema и закрытый generic CRUD config storage.
 * @docref Realize AI Commerce v1.0 — AI plugin data model
 * @see documentation/specifications/realize-ai-commerce/v1.0/03-runtime-delivery-and-security/21-ai-plugin-data-model.md
 */

import { realizeAIPlugin } from "@realize/payload-ai-control";
import type {
  CollectionConfig,
  Config,
  Payload,
  PayloadRequest,
} from "payload";
import { describe, expect, it, vi } from "vitest";

import { AIConfigRepository } from "../../packages/payload-ai-plugin/src/endpoints/aiConfigRepository";

const config = async (): Promise<Config> =>
  await realizeAIPlugin({
    access: {
      canApproveRelease: () => true,
      canManageAIConfiguration: () => true,
      canManageData: () => true,
      canManageIntegrations: () => true,
      canUseChat: () => true,
      canViewRuns: () => true,
    },
    runtime: {
      controlPlaneTokenEnv: "REALIZE_AI_CONTROL_PLANE_TOKEN",
      controlPlaneURL: "http://127.0.0.1:43120",
      mode: "local-development",
    },
  })({ collections: [], endpoints: [] } as unknown as Config);

const field = (collection: CollectionConfig, name: string) =>
  collection.fields.find((value) => "name" in value && value.name === name);

describe("AI config Payload persistence contract", () => {
  it("keeps all four config collections hidden and API-only", async () => {
    const transformed = await config();
    const slugs = [
      "realize-ai-config-drafts",
      "realize-ai-config-releases",
      "realize-ai-active-config-pointers",
      "realize-ai-config-events",
    ];
    const collections = slugs.map((slug) => {
      const collection = transformed.collections?.find(
        (candidate) => candidate.slug === slug,
      );
      if (!collection) throw new Error(`Missing collection: ${slug}`);
      return collection;
    });

    for (const collection of collections) {
      expect(collection.admin?.hidden).toBe(true);
      expect(collection.versions).toBe(false);
      expect(await collection.access?.create?.({} as never)).toBe(false);
      expect(await collection.access?.delete?.({} as never)).toBe(false);
      expect(await collection.access?.read?.({} as never)).toBe(false);
      expect(await collection.access?.update?.({} as never)).toBe(false);
    }
  });

  it("owns uniqueness, immutable hashes and replay keys in schema", async () => {
    const transformed = await config();
    const requireCollection = (slug: string): CollectionConfig => {
      const collection = transformed.collections?.find(
        (candidate) => candidate.slug === slug,
      );
      if (!collection) throw new Error(`Missing collection: ${slug}`);
      return collection;
    };
    const drafts = requireCollection("realize-ai-config-drafts");
    const releases = requireCollection("realize-ai-config-releases");
    const pointers = requireCollection("realize-ai-active-config-pointers");
    const events = requireCollection("realize-ai-config-events");

    expect(field(drafts, "draftID")).toMatchObject({ unique: true });
    expect(field(drafts, "artifacts")).toMatchObject({ type: "json" });
    expect(field(releases, "releaseID")).toMatchObject({ unique: true });
    expect(field(releases, "releaseKey")).toMatchObject({ unique: true });
    expect(field(releases, "manifestHash")).toMatchObject({ index: true });
    expect(field(pointers, "pointerVersionKey")).toMatchObject({
      unique: true,
    });
    expect(field(events, "idempotencyKey")).toMatchObject({ unique: true });
    expect(field(events, "requestHash")).toMatchObject({ index: true });
    expect(field(events, "responseSnapshot")).toMatchObject({ type: "json" });
  });

  it("clears both base release columns during a null lineage replacement", async () => {
    const update = vi.fn().mockResolvedValue({ docs: [{}], errors: [] });
    const repository = new AIConfigRepository(
      { update } as unknown as Payload,
      {} as PayloadRequest,
    );

    await repository.replaceDraft({
      actorID: 42,
      artifacts: [],
      baseRelease: null,
      draftID: "admin-config",
      expectedRevision: 3,
      expectedState: "ready",
    });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          baseReleaseID: null,
          baseReleaseManifestHash: null,
        }),
        where: {
          and: [
            { draftID: { equals: "admin-config" } },
            { revision: { equals: 3 } },
            { state: { equals: "ready" } },
          ],
        },
      }),
    );
  });
});
