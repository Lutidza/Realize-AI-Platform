/**
 * @file services/ai-execution-worker/src/releaseExecutor.ts
 * @version 2026-08-27
 * @description Оркестрирует OCI candidate с worker-only GitHub credential handoff.
 */

import {
  assessReleaseCandidate,
  createReleaseEvidenceHash,
} from "@realize/change-engine";

import type { ExecutionWorkerConfig } from "./config";
import {
  IntegrationRuntimeError,
  type GitHubConnectionResolver,
} from "@realize/payload-ai-control/server/integration-runtime";
import {
  ReleaseOrchestratorError,
  runReleaseOrchestrator,
} from "./releaseOrchestrator";
import type { ReleaseWorkerRepository } from "./releaseRepository";
import type { ClaimedReleaseCandidate } from "./releaseTypes";

class ReleasePolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReleasePolicyError";
  }
}

const sanitizeSummary = (value: string, repositoryRoot: string): string =>
  value
    .replaceAll(repositoryRoot, "[repository]")
    .replace(/\b(?:ghp|github_pat)_[A-Za-z0-9_]{20,}\b/g, "[redacted-token]")
    .slice(0, 4_000);

/** Выполняет claimed release job и сохраняет только проверенный result. */
export const executeClaimedRelease = async (input: {
  config: ExecutionWorkerConfig;
  integrations: GitHubConnectionResolver;
  job: ClaimedReleaseCandidate;
  repository: ReleaseWorkerRepository;
}): Promise<void> => {
  try {
    await input.repository.markBuilding(input.job);
    const integration = await input.integrations.resolvePrimaryGitHub();
    if (integration.state === "disabled") {
      throw new IntegrationRuntimeError("GitHub integration is disabled.");
    }
    const result = await runReleaseOrchestrator({
      config: input.config,
      environment:
        integration.state === "ready"
          ? {
              GH_TOKEN: integration.token,
              REALIZE_AI_GITHUB_REPOSITORY: integration.repositorySlug,
            }
          : undefined,
      request: {
        candidateKey: input.job.candidateKey,
        changeRequestID: String(input.job.changeRequestID),
        expiresAt: input.job.expiresAt,
        gitCommit: input.job.gitCommit,
        repositoryRoot: input.config.repositoryRoot,
        schemaVersion: 1,
        sourceAcceptanceHash: input.job.sourceAcceptanceHash,
        sourcePreviewArtifactHash: input.job.sourcePreviewArtifactHash,
        sourcePreviewEvidenceHash: input.job.sourcePreviewEvidenceHash,
        targetEnvironment: "production",
      },
    });
    await input.repository.markScanning(input.job);
    if (result.gitCommit !== input.job.gitCommit) {
      throw new ReleasePolicyError(
        "Release orchestrator returned a different Git commit.",
      );
    }
    const evidenceHash = createReleaseEvidenceHash({
      candidateKey: input.job.candidateKey,
      configVersion: result.configVersion,
      gitCommit: result.gitCommit,
      healthSummary: result.healthSummary,
      imageDigest: result.imageDigest,
      imageRef: result.imageRef,
      manifestHash: result.manifestHash,
      migrationSetHash: result.migrationSetHash,
      migrations: result.migrations,
      pluginVersions: result.pluginVersions,
      previewStatus: result.previewStatus,
      previewURL: result.previewURL,
      provenanceRef: result.provenanceRef,
      sbomDigest: result.sbomDigest,
      signatureRef: result.signatureRef,
      signatureVerified: result.signatureVerified,
      sourceAcceptanceHash: input.job.sourceAcceptanceHash,
      sourcePreviewArtifactHash: input.job.sourcePreviewArtifactHash,
      sourcePreviewEvidenceHash: input.job.sourcePreviewEvidenceHash,
    });
    const assessment = assessReleaseCandidate({
      configVersion: result.configVersion,
      evidenceHash,
      gitCommit: result.gitCommit,
      imageDigest: result.imageDigest,
      imageRef: result.imageRef,
      manifestHash: result.manifestHash,
      migrationSetHash: result.migrationSetHash,
      migrations: result.migrations,
      pluginVersions: result.pluginVersions,
      previewStatus: result.previewStatus,
      previewURL: result.previewURL,
      provenanceRef: result.provenanceRef,
      sbomDigest: result.sbomDigest,
      signatureRef: result.signatureRef,
      signatureVerified: result.signatureVerified,
    });
    if (!assessment.allowed) {
      throw new ReleasePolicyError(assessment.reason);
    }
    await input.repository.markDeployingPreview(input.job);
    await input.repository.markVerifyingPreview(input.job);
    await input.repository.complete(input.job, result, evidenceHash);
  } catch (error) {
    const summary = sanitizeSummary(
      error instanceof Error
        ? error.message
        : "OCI release preparation failed.",
      input.config.repositoryRoot,
    );
    await input.repository.fail(input.job, {
      blocked:
        error instanceof ReleasePolicyError ||
        error instanceof IntegrationRuntimeError,
      summary,
    });
    if (error instanceof ReleaseOrchestratorError) {
      console.error(
        `[ai-execution-worker] release orchestrator failed candidate=${input.job.id}: ${summary}`,
      );
    }
  }
};
