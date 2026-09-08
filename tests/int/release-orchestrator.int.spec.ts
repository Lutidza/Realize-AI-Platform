/**
 * @file tests/int/release-orchestrator.int.spec.ts
 * @version 2026-08-27
 * @description Проверяет shell-free OCI port и per-call integration environment.
 */

import { createMigrationSetHash } from "@realize/change-engine";
import type { GitHubConnectionResolver } from "@realize/payload-ai-control/server/integration-runtime";
import { describe, expect, it, vi } from "vitest";

import type { ExecutionWorkerConfig } from "../../services/ai-execution-worker/src/config";
import { executeClaimedRelease } from "../../services/ai-execution-worker/src/releaseExecutor";
import * as releaseOrchestrator from "../../services/ai-execution-worker/src/releaseOrchestrator";
import type { ReleaseWorkerRepository } from "../../services/ai-execution-worker/src/releaseRepository";
import type { ClaimedReleaseCandidate } from "../../services/ai-execution-worker/src/releaseTypes";

const result = {
  configVersion: "payload-config-v1",
  gitCommit: "a".repeat(40),
  healthSummary: "Readiness and smoke checks passed.",
  imageDigest: `sha256:${"b".repeat(64)}`,
  imageRef: `ghcr.io/realize/app@sha256:${"b".repeat(64)}`,
  manifestHash: "c".repeat(64),
  migrationSetHash: createMigrationSetHash([]),
  migrations: [],
  pluginVersions: { "@realize/payload-ai-control": "0.1.0" },
  previewStatus: "healthy",
  previewURL: "https://preview.example.test",
  provenanceRef: "oci://provenance/ref",
  sbomDigest: `sha256:${"e".repeat(64)}`,
  schemaVersion: 1,
  signatureRef: "oci://signature/ref",
  signatureVerified: true,
};

const config = (script: string): ExecutionWorkerConfig => ({
  databaseURL: "postgres://unused",
  pollIntervalMs: 1_000,
  previewEnabled: false,
  previewHost: "127.0.0.1",
  previewPortMax: 3_299,
  previewPortMin: 3_200,
  previewRoot: "/tmp/unused-preview",
  previewStartupTimeoutMs: 120_000,
  promotionWorkspaceRoot: "/tmp/unused-promotion",
  releaseEnabled: true,
  releaseOrchestratorArgs: ["--input-type=module", "--eval", script],
  releaseOrchestratorCommand: process.execPath,
  releaseOrchestratorEnvironment: { NODE_ENV: "test" },
  releaseTimeoutMs: 60_000,
  repositoryRoot: process.cwd(),
  reviewTimeoutMs: 60_000,
  signingSecret: "x".repeat(32),
  sourcePromotionEnabled: false,
  sourcePromotionTimeoutMs: 120_000,
  turnTimeoutMs: 60_000,
  workerID: "test-worker",
  workspaceRoot: "/tmp/unused-workspace",
});

const job: ClaimedReleaseCandidate = {
  candidateKey: "candidate-1",
  changeRequestID: 42,
  expiresAt: "2099-01-01T00:00:00.000Z",
  gitCommit: "a".repeat(40),
  id: 7,
  sourceAcceptanceHash: "2".repeat(64),
  sourcePreviewArtifactHash: "f".repeat(64),
  sourcePreviewEvidenceHash: "1".repeat(64),
};

const repositoryFixture = () => ({
  complete: vi.fn().mockResolvedValue(undefined),
  fail: vi.fn().mockResolvedValue(undefined),
  markBuilding: vi.fn().mockResolvedValue(undefined),
  markDeployingPreview: vi.fn().mockResolvedValue(undefined),
  markScanning: vi.fn().mockResolvedValue(undefined),
  markVerifyingPreview: vi.fn().mockResolvedValue(undefined),
});

const integrationFixture = (): GitHubConnectionResolver => ({
  resolvePrimaryGitHub: vi.fn().mockResolvedValue({ state: "absent" }),
});

describe("release orchestrator port", () => {
  it("passes one JSON request over stdin and accepts a strict signed result", async () => {
    const script = [
      "let input = '';",
      "for await (const chunk of process.stdin) input += chunk;",
      "const request = JSON.parse(input);",
      `process.stdout.write(JSON.stringify({...${JSON.stringify(result)}, gitCommit: request.gitCommit}));`,
    ].join("\n");

    await expect(
      releaseOrchestrator.runReleaseOrchestrator({
        config: config(script),
        request: {
          candidateKey: "candidate-1",
          changeRequestID: "42",
          expiresAt: "2099-01-01T00:00:00.000Z",
          gitCommit: "a".repeat(40),
          repositoryRoot: process.cwd(),
          schemaVersion: 1,
          sourceAcceptanceHash: "2".repeat(64),
          sourcePreviewArtifactHash: "f".repeat(64),
          sourcePreviewEvidenceHash: "1".repeat(64),
          targetEnvironment: "production",
        },
      }),
    ).resolves.toEqual(result);
  });

  it("rejects an unsigned result before persistence", () => {
    expect(() =>
      releaseOrchestrator.parseReleaseOrchestratorResult({
        ...result,
        signatureVerified: false,
      }),
    ).toThrow("must verify the image signature");
  });

  it("persists evidence only after the complete exact-commit policy sequence", async () => {
    const script = `process.stdout.write(JSON.stringify(${JSON.stringify(result)}));`;
    const repository = repositoryFixture();

    await executeClaimedRelease({
      config: config(script),
      integrations: integrationFixture(),
      job,
      repository: repository as unknown as ReleaseWorkerRepository,
    });

    expect(repository.markBuilding).toHaveBeenCalledWith(job);
    expect(repository.markScanning).toHaveBeenCalledWith(job);
    expect(repository.markDeployingPreview).toHaveBeenCalledWith(job);
    expect(repository.markVerifyingPreview).toHaveBeenCalledWith(job);
    expect(repository.complete).toHaveBeenCalledWith(
      job,
      result,
      expect.stringMatching(/^[a-f0-9]{64}$/),
    );
    expect(repository.fail).not.toHaveBeenCalled();
  });

  it("blocks a candidate when the orchestrator returns another commit", async () => {
    const mismatched = { ...result, gitCommit: "9".repeat(40) };
    const script = `process.stdout.write(JSON.stringify(${JSON.stringify(mismatched)}));`;
    const repository = repositoryFixture();

    await executeClaimedRelease({
      config: config(script),
      integrations: integrationFixture(),
      job,
      repository: repository as unknown as ReleaseWorkerRepository,
    });

    expect(repository.complete).not.toHaveBeenCalled();
    expect(repository.fail).toHaveBeenCalledWith(job, {
      blocked: true,
      summary: "Release orchestrator returned a different Git commit.",
    });
  });

  it("injects an Admin GitHub connection only into the child environment", async () => {
    const script = [
      "let input = '';",
      "for await (const chunk of process.stdin) input += chunk;",
      "if (process.env.GH_TOKEN !== 'secret-token' || process.env.REALIZE_AI_GITHUB_REPOSITORY !== 'realize/store') process.exit(7);",
      `process.stdout.write(JSON.stringify(${JSON.stringify(result)}));`,
    ].join("\n");
    const repository = repositoryFixture();
    const integrations: GitHubConnectionResolver = {
      resolvePrimaryGitHub: vi.fn().mockResolvedValue({
        repositorySlug: "realize/store",
        revision: 3,
        state: "ready",
        token: "secret-token",
      }),
    };

    await executeClaimedRelease({
      config: config(script),
      integrations,
      job,
      repository: repository as unknown as ReleaseWorkerRepository,
    });

    expect(repository.complete).toHaveBeenCalled();
    expect(repository.fail).not.toHaveBeenCalled();
  });

  it("блокирует отключённое подключение до вызова release orchestrator", async () => {
    const orchestrator = vi
      .spyOn(releaseOrchestrator, "runReleaseOrchestrator")
      .mockRejectedValue(
        new Error("Disabled integration must not reach the orchestrator."),
      );
    const repository = repositoryFixture();
    const integrations: GitHubConnectionResolver = {
      resolvePrimaryGitHub: vi.fn().mockResolvedValue({ state: "disabled" }),
    };
    try {
      await executeClaimedRelease({
        config: config(""),
        integrations,
        job,
        repository: repository as unknown as ReleaseWorkerRepository,
      });
      expect(orchestrator).not.toHaveBeenCalled();
      expect(repository.fail).toHaveBeenCalledWith(job, {
        blocked: true,
        summary: "GitHub integration is disabled.",
      });
      expect(repository.markScanning).not.toHaveBeenCalled();
      expect(repository.complete).not.toHaveBeenCalled();
    } finally {
      orchestrator.mockRestore();
    }
  });
});
