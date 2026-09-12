// @vitest-environment node

/**
 * @file tests/int/ai-config-activation.int.spec.ts
 * @version 1.0.0
 * @date 2026-09-10
 * @description Проверяет strict activation API, config CAS, exact replay и атомарность audit в transaction double.
 */

import {
  parseActivateAIConfigReleaseInput,
  type ActivateAIConfigReleaseInput,
  type ActiveAIConfigPointer,
  type AIConfigDraftDTO,
  type AIConfigReleaseDTO,
  type AIConfigReleaseSummaryDTO,
  type APIResponse,
} from "@realize/ai-contracts";
import {
  createAIConfigRelease,
  SYSTEM_AI_CONFIG_PROJECTION,
} from "@realize/change-engine";
import type { PayloadRequest } from "payload";
import { describe, expect, it, vi } from "vitest";
import { lockAIConfigMutation } from "../../packages/payload-ai-plugin/src/endpoints/lockAIConfigMutation.util";
import { AI_CONFIG_ARTIFACTS } from "./fixtures/aiConfiguration";
import { createAIConfigAPITestHarness } from "./support/aiConfigAPITestHarness";

type Harness = Awaited<ReturnType<typeof createAIConfigAPITestHarness>>;
const pointerSlug = "realize-ai-active-config-pointers";
const eventSlug = "realize-ai-config-events";
let actorID = 1000;
const harness = () => createAIConfigAPITestHarness({ actorID: ++actorID });
const dataOf = <T>(response: APIResponse<T>): T => {
  if (!response.ok) throw new Error(response.error.message);
  return response.data;
};
const released = async (api: Harness, draftID = "first-config") => {
  const created = await api.invoke("post", "/realize-ai/config/drafts", {
    body: {
      artifacts: AI_CONFIG_ARTIFACTS,
      baseRelease: null,
      draftID,
      expectedRevision: 0,
      schemaVersion: "1.0",
    },
    idempotencyKey: `${draftID}:create`,
  });
  expect(created.status).toBe(201);
  const validated = await api.invoke("post", "/realize-ai/config/validate", {
    body: { draftID, expectedRevision: 1, schemaVersion: "1.0" },
    idempotencyKey: `${draftID}:validate`,
  });
  expect(validated.status).toBe(200);
  return dataOf(
    (
      await api.invoke<AIConfigReleaseSummaryDTO>(
        "post",
        "/realize-ai/config/releases",
        {
          body: {
            draftID,
            expectedDraftRevision: 2,
            expectedSystemManifestHash:
              SYSTEM_AI_CONFIG_PROJECTION.manifestHash,
            schemaVersion: "1.0",
          },
          idempotencyKey: `${draftID}:release`,
        },
      )
    ).body,
  );
};
const inputFor = (
  release: Pick<AIConfigReleaseDTO, "id" | "manifestHash">,
  version = 0,
): ActivateAIConfigReleaseInput => ({
  action: "activate",
  expectedPointerVersion: version,
  expectedReleaseManifestHash: release.manifestHash,
  expectedSystemManifestHash: SYSTEM_AI_CONFIG_PROJECTION.manifestHash,
  releaseID: release.id,
  schemaVersion: "1.0",
});
const activate = (
  api: Harness,
  body: ActivateAIConfigReleaseInput,
  idempotencyKey = "config:activate",
) =>
  api.invoke<ActiveAIConfigPointer>("post", "/realize-ai/config/activate", {
    body,
    idempotencyKey,
  });

describe("activation command parsing", () => {
  const input = inputFor({ id: "release-v1", manifestHash: "a".repeat(64) });
  it("accepts the first pointer and explicit rollback without client authority fields", () => {
    expect(parseActivateAIConfigReleaseInput(input)).toEqual(input);
    expect(
      parseActivateAIConfigReleaseInput({
        ...input,
        action: "rollback",
        expectedPointerVersion: 12,
      }),
    ).toMatchObject({ action: "rollback", expectedPointerVersion: 12 });
  });
  it.each([
    null,
    [],
    { ...input, actor: "other" },
    { ...input, action: "publish" },
    { ...input, expectedPointerVersion: -1 },
    { ...input, expectedPointerVersion: 1.5 },
    { ...input, expectedPointerVersion: "1" },
    { ...input, expectedPointerVersion: Number.MAX_SAFE_INTEGER },
    { ...input, expectedReleaseManifestHash: "bad" },
    { ...input, expectedSystemManifestHash: "A".repeat(64) },
    { ...input, releaseID: "bad id" },
    { ...input, schemaVersion: "2.0" },
  ])("rejects malformed or authoritative input %#", (value) => {
    expect(() => parseActivateAIConfigReleaseInput(value)).toThrow();
  });
  it.each(Object.keys(input))("requires %s", (key) => {
    const missing: Record<string, unknown> = { ...input };
    delete missing[key];
    expect(() => parseActivateAIConfigReleaseInput(missing)).toThrow(
      "required",
    );
  });
});

describe("activation API", () => {
  it("activates, rolls back and replays the original pointer after later switches", async () => {
    const api = await harness();
    const first = await released(api);
    const second = await released(api, "second-config");
    const input = inputFor(first);
    const initial = dataOf((await activate(api, input)).body);
    expect(initial).toMatchObject({
      manifestHash: first.manifestHash,
      releaseID: first.id,
      version: 1,
    });
    expect(Object.keys(initial).sort()).toEqual([
      "activatedAt",
      "activatedBy",
      "manifestHash",
      "releaseID",
      "version",
    ]);
    expect(
      dataOf((await activate(api, inputFor(second, 1), "config:second")).body)
        .version,
    ).toBe(2);
    const rollback = { ...inputFor(first, 2), action: "rollback" as const };
    expect(
      dataOf((await activate(api, rollback, "config:rollback")).body).version,
    ).toBe(3);
    expect(dataOf((await activate(api, input)).body)).toEqual(initial);
    expect(
      (await activate(api, inputFor(first, 3), "config:same-target")).status,
    ).toBe(409);
    expect(
      (
        await activate(
          api,
          { ...inputFor(second, 3), action: "rollback" },
          "config:bad-rollback",
        )
      ).status,
    ).toBe(409);
    expect(api.count(pointerSlug)).toBe(3);
    expect(
      api.documents(pointerSlug).map((pointer) => pointer.pointerVersionKey),
    ).toEqual(["installation:1", "installation:2", "installation:3"]);
    expect(
      api
        .documents(eventSlug)
        .slice(-3)
        .map((event) => [event.action, event.resourceKind, event.resourceID]),
    ).toEqual([
      ["config_activated", "release", first.id],
      ["config_activated", "release", second.id],
      ["config_rolled_back", "release", first.id],
    ]);
  });

  it("rejects stale pointer/system/target hashes, missing release and rollback without an active release", async () => {
    const api = await harness();
    const release = await released(api);
    const input = inputFor(release);
    for (const [index, change] of [
      { expectedPointerVersion: 4 },
      { expectedReleaseManifestHash: "0".repeat(64) },
      { expectedSystemManifestHash: "0".repeat(64) },
      { action: "rollback" as const },
    ].entries()) {
      expect(
        (
          await activate(
            api,
            { ...input, ...change },
            `config:invalid-${index}`,
          )
        ).status,
      ).toBe(409);
    }
    expect(
      (
        await activate(
          api,
          { ...input, releaseID: "missing-release" },
          "config:missing",
        )
      ).status,
    ).toBe(404);
    expect(api.count(pointerSlug)).toBe(0);
    expect(api.count(eventSlug)).toBe(3);
  });

  it("binds replay to actor, request and action before returning stored responses", async () => {
    const api = await harness();
    const release = await released(api);
    const input = inputFor(release);
    expect((await activate(api, input)).status).toBe(200);
    expect(
      (
        await api.invoke("post", "/realize-ai/config/activate", {
          body: input,
          idempotencyKey: "config:activate",
          actorID: 99999,
        })
      ).status,
    ).toBe(409);
    expect((await activate(api, { ...input, action: "rollback" })).status).toBe(
      409,
    );
    expect(
      (await activate(api, { ...input, expectedPointerVersion: 1 })).status,
    ).toBe(409);
    expect(api.count(pointerSlug)).toBe(1);
    expect(api.count(eventSlug)).toBe(4);
  });

  it("serializes concurrent CAS contenders and concurrent identical retries", async () => {
    const api = await harness();
    const release = await released(api);
    const input = inputFor(release);
    const contenders = await Promise.all([
      activate(api, input, "config:contender-a"),
      activate(api, input, "config:contender-b"),
    ]);
    expect(contenders.map((result) => result.status).sort()).toEqual([
      200, 409,
    ]);
    expect(api.count(pointerSlug)).toBe(1);
    const second = await released(api, "second-config");
    const retries = await Promise.all([
      activate(api, inputFor(second, 1), "config:identical"),
      activate(api, inputFor(second, 1), "config:identical"),
    ]);
    expect(retries.map((result) => result.status)).toEqual([200, 200]);
    expect(dataOf(retries[0].body)).toEqual(dataOf(retries[1].body));
    expect(api.count(pointerSlug)).toBe(2);
    expect(api.count(eventSlug)).toBe(8);
    expect(api.lockQueries.length).toBeGreaterThanOrEqual(8);
  });

  it("rolls pointer insertion back with a failed audit and permits an exact retry", async () => {
    const api = await harness();
    const release = await released(api);
    api.failNextWrite(eventSlug);
    expect((await activate(api, inputFor(release))).status).toBe(500);
    expect(api.count(pointerSlug)).toBe(0);
    expect(api.count(eventSlug)).toBe(3);
    expect((await activate(api, inputFor(release))).status).toBe(200);
    expect(api.count(pointerSlug)).toBe(1);
    expect(api.count(eventSlug)).toBe(4);
  });

  it.each(["incompatible", "expanded"] as const)(
    "rejects a verified but %s exact release",
    async (kind) => {
      const api = await harness();
      const summary = await released(api);
      const original = dataOf(
        (
          await api.invoke<AIConfigReleaseDTO>(
            "get",
            "/realize-ai/config/releases/:id",
            { routeParams: { id: summary.id } },
          )
        ).body,
      );
      const artifacts = structuredClone(
        original.artifacts.map(({ artifact }) => artifact),
      );
      if (kind === "expanded") {
        const binding = artifacts.find(
          (artifact) => artifact.kind === "capability_binding",
        );
        if (binding?.kind !== "capability_binding")
          throw new Error("Missing fixture binding");
        binding.allowedActions = ["category.delete"];
      }
      const release = createAIConfigRelease({
        createdAt: original.createdAt,
        createdBy: original.createdBy,
        draft: {
          artifacts,
          id: original.sourceDraftID,
          revision: original.sourceDraftRevision,
          schemaVersion: "1.0",
          state: "ready",
        },
        releaseID: original.id,
        releaseVersion: original.version,
        systemCompatibility:
          kind === "incompatible"
            ? { minimumRelease: "2.0", maximumRelease: "2.0" }
            : original.systemCompatibility,
      });
      api.patchStored("realize-ai-config-releases", 0, {
        artifacts: release.artifacts,
        manifestHash: release.manifestHash,
        systemMinimumRelease: release.systemCompatibility.minimumRelease,
        systemMaximumRelease: release.systemCompatibility.maximumRelease,
      });
      expect((await activate(api, inputFor(release))).status).toBe(400);
      expect(api.count(pointerSlug)).toBe(0);
    },
  );

  it("keeps authentication, manager permission and idempotency mandatory", async () => {
    const api = await createAIConfigAPITestHarness({ canManage: false });
    const body = inputFor({ id: "release-v1", manifestHash: "a".repeat(64) });
    expect((await activate(api, body)).status).toBe(403);
    expect(
      (
        await api.invoke("post", "/realize-ai/config/activate", {
          body,
          actorID: null,
          idempotencyKey: "config:no-auth",
        })
      ).status,
    ).toBe(401);
    const allowed = await harness();
    expect(
      (await allowed.invoke("post", "/realize-ai/config/activate", { body }))
        .status,
    ).toBe(400);
    expect(api.count(pointerSlug)).toBe(0);
  });
});

describe("draft lifecycle transaction guards", () => {
  it.each(["released", "validating"] as const)(
    "rejects replacement of a %s draft and preserves its artifacts",
    async (state) => {
      const api = await harness();
      await released(api);
      if (state === "validating")
        api.patchStored("realize-ai-config-drafts", 0, { state });
      const before = api.documents("realize-ai-config-drafts");
      const result = await api.invoke("put", "/realize-ai/config/drafts/:id", {
        body: {
          artifacts: AI_CONFIG_ARTIFACTS,
          baseRelease: null,
          expectedRevision: 3,
          schemaVersion: "1.0",
        },
        routeParams: { id: "first-config" },
        idempotencyKey: "config:readonly-update",
      });
      expect(result.status).toBe(409);
      expect(api.documents("realize-ai-config-drafts")).toEqual(before);
      expect(api.count(eventSlug)).toBe(3);
    },
  );

  it("allows one concurrent ready-draft update and rejects the stale second update", async () => {
    const api = await harness();
    await released(api);
    api.patchStored("realize-ai-config-drafts", 0, { state: "ready" });
    const update = (key: string) =>
      api.invoke("put", "/realize-ai/config/drafts/:id", {
        body: {
          artifacts: AI_CONFIG_ARTIFACTS,
          baseRelease: null,
          expectedRevision: 3,
          schemaVersion: "1.0",
        },
        routeParams: { id: "first-config" },
        idempotencyKey: key,
      });
    expect(
      (
        await Promise.all([
          update("config:update-a"),
          update("config:update-b"),
        ])
      )
        .map((result) => result.status)
        .sort(),
    ).toEqual([200, 409]);
    const draft = dataOf(
      (
        await api.invoke<AIConfigDraftDTO>(
          "get",
          "/realize-ai/config/drafts/:id",
          { routeParams: { id: "first-config" } },
        )
      ).body,
    );
    expect(draft).toMatchObject({ revision: 4, state: "editing" });
  });

  it("fails closed when the adapter has no active transaction session", async () => {
    const execute = vi.fn();
    for (const db of [
      { name: "postgres" },
      { name: "sqlite", sessions: { tx: { db: { execute } } } },
    ]) {
      await expect(
        lockAIConfigMutation({
          transactionID: "tx",
          payload: { db },
        } as unknown as PayloadRequest),
      ).rejects.toThrow("active PostgreSQL transaction");
    }
    expect(execute).not.toHaveBeenCalled();
  });
});
