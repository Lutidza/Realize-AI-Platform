// @vitest-environment node
/**
 * @file tests/int/release-worker-readiness.int.spec.ts
 * @version 1.0.0
 * @date 2026-09-17
 * @description Проверяет согласованность кнопки и API подготовки выпуска с реальной доступностью исполнителя.
 */

import { createPreviewAcceptanceBinding } from "@realize/change-engine";
import type { PayloadRequest } from "payload";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ChangeRepository } from "../../packages/payload-ai-plugin/src/endpoints/changeRepository";
import { projectChangeRequest } from "../../packages/payload-ai-plugin/src/endpoints/changeProjection";
import { DeploymentRepository } from "../../packages/payload-ai-plugin/src/endpoints/deploymentRepository";
import { ExecutionRepository } from "../../packages/payload-ai-plugin/src/endpoints/executionRepository";
import { createReleaseHandlers } from "../../packages/payload-ai-plugin/src/endpoints/releaseHandlers";
import { ReleaseRepository } from "../../packages/payload-ai-plugin/src/endpoints/releaseRepository";
import type { AIDocument } from "../../packages/payload-ai-plugin/src/endpoints/repository";
import { SourcePromotionRepository } from "../../packages/payload-ai-plugin/src/endpoints/sourcePromotionRepository";
import { readWorkerPresence } from "../../packages/payload-ai-plugin/src/integrations/runtime/readWorkerPresence.service";
import type { WorkerPresenceSnapshot } from "../../packages/payload-ai-plugin/src/integrations/runtime/WorkerPresence.types";
import { sanitizeOptions } from "../../packages/payload-ai-plugin/src/options";

vi.mock(
  "../../packages/payload-ai-plugin/src/endpoints/requireCodexChatTool.service",
  () => ({ requireCodexChatTool: vi.fn(async () => undefined) }),
);
vi.mock(
  "../../packages/payload-ai-plugin/src/integrations/runtime/readWorkerPresence.service",
  () => ({ readWorkerPresence: vi.fn() }),
);

afterEach(() => vi.restoreAllMocks());

const snapshot = (
  state: "idle" | "busy" | "draining" | "stopped" = "idle",
  release = true,
): WorkerPresenceSnapshot => ({
  readable: true,
  rows: [
    {
      instance_key: "fixture-release-worker",
      state,
      last_seen_at: "2026-09-17T10:00:00.000Z",
      fresh: true,
      capabilities: {
        execution: true,
        preview: true,
        sourcePromotion: true,
        release,
      },
      current_kind: state === "busy" ? "preview" : null,
      current_change_request: state === "busy" ? "99" : null,
    },
  ],
});

const fixture = (presence = snapshot()) => {
  vi.mocked(readWorkerPresence).mockResolvedValue(presence);
  const expiresAt = "2099-01-02T00:00:00.000Z";
  const change: AIDocument = {
    id: 18,
    conversation: 2,
    version: 16,
    state: "preview_accepted",
  };
  const deployment: AIDocument = {
    id: 5,
    status: "accepted",
    commitSHA: "a".repeat(40),
    artifactHash: "b".repeat(64),
    evidenceHash: "c".repeat(64),
    reviewEvidenceHash: "d".repeat(64),
    sourceDiffHash: "e".repeat(64),
    expiresAt,
  };
  const previewAcceptance: AIDocument = {
    id: 8,
    actor: 7,
    roleSnapshot: ["admin"],
    decision: "approved",
    decisionKey: "18:15:PREVIEW_ACCEPTANCE",
    artifactHash: deployment.artifactHash,
    expiresAt,
    boundHash: createPreviewAcceptanceBinding({
      actorID: "7",
      actorRoles: ["admin"],
      artifactHash: String(deployment.artifactHash),
      changeRequestID: "18",
      commitSHA: String(deployment.commitSHA),
      decision: "approved",
      environment: "local-preview",
      evidenceHash: String(deployment.evidenceHash),
      expiresAt,
      reviewerEvidenceHash: String(deployment.reviewEvidenceHash),
      sourceDiffHash: String(deployment.sourceDiffHash),
      version: 15,
    }),
  };
  const options = sanitizeOptions({
    enabled: true,
    access: {
      canApproveRelease: () => true,
      canManageAIConfiguration: () => false,
      canManageData: () => false,
      canManageIntegrations: () => false,
      canUseChat: () => true,
      canViewRuns: () => false,
    },
    release: { enabled: true },
    runtime: {
      controlPlaneTokenEnv: "SYNTHETIC_TEST_CONTROL_TOKEN",
      mode: "local-development",
    },
  });
  const req = {
    user: { id: 7 },
    headers: new Headers({ "idempotency-key": "fixture-release-attempt" }),
    routeParams: { id: "18" },
    json: async () => ({
      expectedVersion: 16,
      expectedPreviewArtifactHash: deployment.artifactHash,
    }),
    payload: { db: { defaultIDType: "number" }, logger: { error: vi.fn() } },
  } as unknown as PayloadRequest;

  let candidate: AIDocument | undefined;
  vi.spyOn(ChangeRepository.prototype, "getOwnedChange").mockResolvedValue(
    change,
  );
  vi.spyOn(ChangeRepository.prototype, "getApproval").mockImplementation(
    async (_id, type) =>
      type === "PREVIEW_ACCEPTANCE" ? previewAcceptance : undefined,
  );
  const updateState = vi
    .spyOn(ChangeRepository.prototype, "updateState")
    .mockImplementation(async (_id, update) => Object.assign(change, update));
  vi.spyOn(
    DeploymentRepository.prototype,
    "getLatestDeployment",
  ).mockResolvedValue(deployment);
  vi.spyOn(
    DeploymentRepository.prototype,
    "listCheckResults",
  ).mockResolvedValue([]);
  vi.spyOn(ExecutionRepository.prototype, "getLatestJob").mockResolvedValue(
    undefined,
  );
  vi.spyOn(
    SourcePromotionRepository.prototype,
    "getLatestPromotion",
  ).mockResolvedValue(undefined);
  const latestCandidate = vi
    .spyOn(ReleaseRepository.prototype, "getLatestCandidate")
    .mockImplementation(async () => candidate);
  const idempotentCandidate = vi
    .spyOn(ReleaseRepository.prototype, "findByIdempotencyKey")
    .mockResolvedValue(undefined);
  const createCandidate = vi
    .spyOn(ReleaseRepository.prototype, "createCandidate")
    .mockImplementation(async (input) => {
      candidate = { ...input, id: 3, status: "queued", stage: "queued" };
      return candidate;
    });
  const project = () =>
    projectChangeRequest({
      change,
      options,
      previewAcceptance,
      deploymentRepository: new DeploymentRepository(req.payload, req),
      executionRepository: new ExecutionRepository(req.payload, req),
      releaseRepository: new ReleaseRepository(req.payload, req),
      sourcePromotionRepository: new SourcePromotionRepository(
        req.payload,
        req,
      ),
    });
  return {
    change,
    createCandidate,
    idempotentCandidate,
    latestCandidate,
    prepare: () => createReleaseHandlers(options).prepare(req),
    project,
    updateState,
  };
};

const unavailable = [
  {
    label: "исполнитель без release capability",
    presence: snapshot("idle", false),
  },
  { label: "остановленный исполнитель", presence: snapshot("stopped") },
  { label: "останавливающийся исполнитель", presence: snapshot("draining") },
  { label: "отсутствие heartbeat", presence: { readable: true, rows: [] } },
  { label: "недоступное хранилище", presence: { readable: false, rows: [] } },
  {
    label: "устаревший heartbeat",
    presence: {
      ...snapshot(),
      rows: snapshot().rows.map((row) => ({ ...row, fresh: false })),
    },
  },
];

describe("готовность подготовки OCI-кандидата", () => {
  it.each(unavailable)(
    "$label запрещает кнопку и API без записи очереди",
    async ({ presence }) => {
      const f = fixture(presence);
      const projection = await f.project();
      expect(projection.release.enabled).toBe(false);
      expect(projection.release.reason).toBeTruthy();
      const response = await f.prepare();
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({
        ok: false,
        error: { code: "CONFLICT", message: projection.release.reason },
      });
      expect(f.createCandidate).not.toHaveBeenCalled();
      expect(f.updateState).not.toHaveBeenCalled();
      expect(f.change.state).toBe("preview_accepted");
    },
  );

  it.each(["idle", "busy"] as const)(
    "%s исполнитель разрешает кнопку и новое задание",
    async (state) => {
      const f = fixture(snapshot(state));
      const projection = await f.project();
      expect(projection.release).toMatchObject({ enabled: true });
      expect(projection.execution.worker?.currentJob).toBeNull();
      const response = await f.prepare();
      expect(response.status).toBe(202);
      expect(f.createCandidate).toHaveBeenCalledTimes(1);
      expect(f.updateState).toHaveBeenCalledWith("18", {
        state: "release_preparing",
        version: 17,
      });
      expect(await response.json()).toMatchObject({
        ok: true,
        data: {
          release: { enabled: false, candidate: { id: "3", status: "queued" } },
        },
      });
    },
  );

  it.each(["latest", "idempotency"] as const)(
    "возвращает существующего кандидата через %s при недоступном исполнителе",
    async (source) => {
      const f = fixture(snapshot("idle", false));
      f.change.state = "release_preparing";
      f.change.version = 17;
      const candidate = { id: 3, status: "queued", stage: "queued" };
      if (source === "latest") f.latestCandidate.mockResolvedValue(candidate);
      else {
        f.idempotentCandidate.mockResolvedValue(candidate);
        f.latestCandidate
          .mockResolvedValueOnce(undefined)
          .mockResolvedValue(candidate);
      }
      const response = await f.prepare();
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        ok: true,
        data: {
          release: { enabled: false, candidate: { id: "3", status: "queued" } },
        },
      });
      expect(f.createCandidate).not.toHaveBeenCalled();
      expect(f.updateState).not.toHaveBeenCalled();
    },
  );
});
