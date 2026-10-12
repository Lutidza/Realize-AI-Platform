// @vitest-environment node

/**
 * @file tests/int/ai-config-api.int.spec.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Проверяет strict, optimistic и idempotent Config API end to end.
 * @docref Realize — AI Platform v1.0 — API и streaming contracts
 * @see documentation/specifications/realize-ai-commerce/v1.0/03-runtime-delivery-and-security/22-api-and-streaming-contracts.md
 */

import type {
  AIConfigBootstrapDTO,
  AIConfigDraftDTO,
  AIConfigDraftSummaryDTO,
  AIConfigReleaseDTO,
  AIConfigReleaseSummaryDTO,
  AIConfigValidationDTO,
  APIResponse,
} from "@realize/ai-contracts";
import { describe, expect, it } from "vitest";

import { AI_CONFIG_ARTIFACTS } from "./fixtures/aiConfiguration";
import { createAIConfigAPITestHarness } from "./support/aiConfigAPITestHarness";

const dataOf = <T>(body: APIResponse<T>): T => {
  if (!body.ok) throw new Error(`Unexpected API error: ${body.error.message}`);
  return body.data;
};

const createBody = () => ({
  artifacts: structuredClone(AI_CONFIG_ARTIFACTS),
  baseRelease: null,
  draftID: "admin-config",
  expectedRevision: 0,
  schemaVersion: "1.0",
});

describe("installation AI Config API", () => {
  it("rejects unknown fields and non-monotonic artifact revisions", async () => {
    const api = await createAIConfigAPITestHarness();
    const invalid = await api.invoke<AIConfigDraftSummaryDTO>(
      "post",
      "/realize-ai/config/drafts",
      {
        body: { ...createBody(), actor: "client-admin" },
        idempotencyKey: "config-create-invalid",
      },
    );
    expect(invalid.status).toBe(400);
    expect(invalid.body).toMatchObject({
      error: { code: "INVALID_REQUEST" },
      ok: false,
    });
    expect(api.count("realize-ai-config-drafts")).toBe(0);

    const created = await api.invoke<AIConfigDraftSummaryDTO>(
      "post",
      "/realize-ai/config/drafts",
      { body: createBody(), idempotencyKey: "config-create-revisions" },
    );
    expect(created.status).toBe(201);

    const changed = structuredClone(AI_CONFIG_ARTIFACTS);
    changed[0] = { ...changed[0], title: "Изменённая capability" };
    const nonMonotonic = await api.invoke<AIConfigDraftSummaryDTO>(
      "put",
      "/realize-ai/config/drafts/:id",
      {
        body: {
          artifacts: changed,
          baseRelease: null,
          expectedRevision: 1,
          schemaVersion: "1.0",
        },
        idempotencyKey: "config-update-bad-revision",
        routeParams: { id: "admin-config" },
      },
    );
    expect(nonMonotonic.status).toBe(400);
    expect(nonMonotonic.body).toMatchObject({
      error: {
        code: "INVALID_REQUEST",
        details: {
          issues: [
            expect.objectContaining({
              code: "config_artifact_revision_non_monotonic",
            }),
          ],
        },
      },
      ok: false,
    });

    changed[0] = { ...changed[0], revision: 2 };
    const updated = await api.invoke<AIConfigDraftSummaryDTO>(
      "put",
      "/realize-ai/config/drafts/:id",
      {
        body: {
          artifacts: changed,
          baseRelease: null,
          expectedRevision: 1,
          schemaVersion: "1.0",
        },
        idempotencyKey: "config-update-good-revision",
        routeParams: { id: "admin-config" },
      },
    );
    expect(dataOf(updated.body)).toMatchObject({
      revision: 2,
      state: "editing",
    });

    const stale = await api.invoke<AIConfigDraftSummaryDTO>(
      "put",
      "/realize-ai/config/drafts/:id",
      {
        body: {
          artifacts: changed,
          baseRelease: null,
          expectedRevision: 1,
          schemaVersion: "1.0",
        },
        idempotencyKey: "config-update-stale-revision",
        routeParams: { id: "admin-config" },
      },
    );
    expect(stale.status).toBe(409);
    expect(stale.body).toMatchObject({
      error: { code: "CONFLICT" },
      ok: false,
    });
  });

  it("creates, validates, releases and replays one exact aggregate", async () => {
    const api = await createAIConfigAPITestHarness();
    const bootstrapBefore = dataOf(
      (await api.invoke<AIConfigBootstrapDTO>("get", "/realize-ai/config"))
        .body,
    );
    expect(bootstrapBefore).toMatchObject({
      activePointer: null,
      drafts: [],
      releases: [],
      schemaVersion: "1.0",
    });

    const createInput = createBody();
    const created = await api.invoke<AIConfigDraftSummaryDTO>(
      "post",
      "/realize-ai/config/drafts",
      { body: createInput, idempotencyKey: "config-create-admin" },
    );
    const replayedCreate = await api.invoke<AIConfigDraftSummaryDTO>(
      "post",
      "/realize-ai/config/drafts",
      { body: createInput, idempotencyKey: "config-create-admin" },
    );
    expect(dataOf(replayedCreate.body)).toEqual(dataOf(created.body));
    expect(api.count("realize-ai-config-drafts")).toBe(1);
    expect(api.count("realize-ai-config-events")).toBe(1);
    const mismatchedReplay = await api.invoke<AIConfigDraftSummaryDTO>(
      "post",
      "/realize-ai/config/drafts",
      {
        body: { ...createInput, draftID: "other-config" },
        idempotencyKey: "config-create-admin",
      },
    );
    expect(mismatchedReplay.status).toBe(409);
    expect(mismatchedReplay.body).toMatchObject({
      error: { code: "CONFLICT" },
      ok: false,
    });

    const validated = await api.invoke<AIConfigValidationDTO>(
      "post",
      "/realize-ai/config/validate",
      {
        body: {
          draftID: "admin-config",
          expectedRevision: 1,
          schemaVersion: "1.0",
        },
        idempotencyKey: "config-validate-admin",
      },
    );
    expect(dataOf(validated.body)).toEqual({
      checkedRevision: 1,
      draftID: "admin-config",
      issues: [],
      resultingRevision: 2,
      state: "ready",
      systemManifestHash: bootstrapBefore.system.manifestHash,
      valid: true,
    });

    const releaseInput = {
      draftID: "admin-config",
      expectedDraftRevision: 2,
      expectedSystemManifestHash: bootstrapBefore.system.manifestHash,
      schemaVersion: "1.0",
    };
    const released = await api.invoke<AIConfigReleaseSummaryDTO>(
      "post",
      "/realize-ai/config/releases",
      { body: releaseInput, idempotencyKey: "config-release-admin" },
    );
    const releaseSummary = dataOf(released.body);
    expect(releaseSummary).toMatchObject({
      artifactCount: AI_CONFIG_ARTIFACTS.length,
      id: "installation-config-v1",
      sourceDraftID: "admin-config",
      sourceDraftRevision: 2,
      version: 1,
    });
    const replayedRelease = await api.invoke<AIConfigReleaseSummaryDTO>(
      "post",
      "/realize-ai/config/releases",
      { body: releaseInput, idempotencyKey: "config-release-admin" },
    );
    expect(dataOf(replayedRelease.body)).toEqual(dataOf(released.body));

    const detail = dataOf(
      (
        await api.invoke<AIConfigReleaseDTO>(
          "get",
          "/realize-ai/config/releases/:id",
          { routeParams: { id: releaseSummary.id } },
        )
      ).body,
    );
    expect(detail.manifestHash).toBe(releaseSummary.manifestHash);
    expect(detail.artifacts).toHaveLength(AI_CONFIG_ARTIFACTS.length);

    const draft = dataOf(
      (
        await api.invoke<AIConfigDraftDTO>(
          "get",
          "/realize-ai/config/drafts/:id",
          { routeParams: { id: "admin-config" } },
        )
      ).body,
    );
    expect(draft).toMatchObject({ revision: 3, state: "released" });
    expect(api.count("realize-ai-config-releases")).toBe(1);
    expect(api.count("realize-ai-config-events")).toBe(3);
    expect(api.logger.error).not.toHaveBeenCalled();
  });

  it("persists invalid validation replay without advancing the draft", async () => {
    const api = await createAIConfigAPITestHarness();
    await api.invoke<AIConfigDraftSummaryDTO>(
      "post",
      "/realize-ai/config/drafts",
      {
        body: { ...createBody(), artifacts: [] },
        idempotencyKey: "config-create-empty",
      },
    );
    const validationInput = {
      draftID: "admin-config",
      expectedRevision: 1,
      schemaVersion: "1.0",
    };
    const validation = await api.invoke<AIConfigValidationDTO>(
      "post",
      "/realize-ai/config/validate",
      {
        body: validationInput,
        idempotencyKey: "config-validate-empty",
      },
    );
    expect(dataOf(validation.body)).toMatchObject({
      checkedRevision: 1,
      issues: [
        expect.objectContaining({ code: "config_agent_profile_missing" }),
      ],
      resultingRevision: 1,
      state: "editing",
      valid: false,
    });
    const replay = await api.invoke<AIConfigValidationDTO>(
      "post",
      "/realize-ai/config/validate",
      {
        body: validationInput,
        idempotencyKey: "config-validate-empty",
      },
    );
    expect(dataOf(replay.body)).toEqual(dataOf(validation.body));
    const draft = dataOf(
      (
        await api.invoke<AIConfigDraftDTO>(
          "get",
          "/realize-ai/config/drafts/:id",
          { routeParams: { id: "admin-config" } },
        )
      ).body,
    );
    expect(draft).toMatchObject({ revision: 1, state: "editing" });
  });
});
