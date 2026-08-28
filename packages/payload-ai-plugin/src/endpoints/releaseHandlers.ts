/**
 * @file packages/payload-ai-plugin/src/endpoints/releaseHandlers.ts
 * @version 2026-08-22
 * @description Ставит accepted preview в OCI-очередь и хранит отдельное release approval.
 */

import {
  parseApproveReleaseInput,
  parseIdentifier,
  parsePrepareReleaseInput,
  parseRejectReleaseInput,
} from "@realize/ai-contracts";
import {
  assessReleaseCandidate,
  createReleaseApprovalBinding,
  createReleaseCandidateKey,
  createReleaseEvidenceHash,
} from "@realize/change-engine";
import type { PayloadHandler as PayloadEndpointHandler } from "payload";

import type { SanitizedRealizeAIPluginOptions } from "../types";
import {
  consumeRateLimit,
  requireChatUser,
  requireReleaseApprover,
} from "./access";
import { projectChangeRequest } from "./changeProjection";
import { ChangeRepository } from "./changeRepository";
import { DeploymentRepository } from "./deploymentRepository";
import { ExecutionRepository } from "./executionRepository";
import { EndpointError, success } from "./http";
import { relationID, toReleaseCandidateDTO } from "./mappers";
import { ReleaseRepository } from "./releaseRepository";
import { idempotencyKeyFor, readBody, withHandler } from "./request";
import { requireAcceptedPreviewBinding } from "./previewAcceptanceGuard";
import { SourcePromotionRepository } from "./sourcePromotionRepository";

const stringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];

const rolesOf = (user: unknown): string[] => {
  const roles = (user as { roles?: unknown } | null)?.roles;
  return stringArray(roles);
};

const stringRecord = (value: unknown): Record<string, string> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(
        Object.entries(value).filter(
          (entry): entry is [string, string] => typeof entry[1] === "string",
        ),
      )
    : {};

const releaseMigrations = (
  value: unknown,
): Array<{ checksum: string; direction: "up"; id: string }> =>
  Array.isArray(value)
    ? value.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const migration = item as Record<string, unknown>;
        if (
          migration.direction !== "up" ||
          typeof migration.checksum !== "string" ||
          typeof migration.id !== "string"
        ) {
          return [];
        }
        return [
          {
            checksum: migration.checksum,
            direction: "up" as const,
            id: migration.id,
          },
        ];
      })
    : [];

const project = async (input: {
  changeRequestID: string;
  options: SanitizedRealizeAIPluginOptions;
  req: Parameters<PayloadEndpointHandler>[0];
  userID: number | string;
}) => {
  const changeRepository = new ChangeRepository(input.req.payload, input.req);
  const executionRepository = new ExecutionRepository(
    input.req.payload,
    input.req,
  );
  const deploymentRepository = new DeploymentRepository(
    input.req.payload,
    input.req,
  );
  const releaseRepository = new ReleaseRepository(input.req.payload, input.req);
  const sourcePromotionRepository = new SourcePromotionRepository(
    input.req.payload,
    input.req,
  );
  const [change, approval, acceptance, previewAcceptance, releaseApproval] =
    await Promise.all([
      changeRepository.getOwnedChange(input.changeRequestID, input.userID),
      changeRepository.getApproval(input.changeRequestID),
      changeRepository.getApproval(
        input.changeRequestID,
        "IMPLEMENTATION_ACCEPTANCE",
      ),
      changeRepository.getApproval(input.changeRequestID, "PREVIEW_ACCEPTANCE"),
      changeRepository.getApproval(input.changeRequestID, "RELEASE_APPROVAL"),
    ]);
  return await projectChangeRequest({
    acceptance,
    approval,
    change,
    deploymentRepository,
    executionRepository,
    options: input.options,
    previewAcceptance,
    releaseApproval,
    releaseRepository,
    sourcePromotionRepository,
  });
};

const releaseDecisionHandler = (
  options: SanitizedRealizeAIPluginOptions,
  decision: "approved" | "rejected",
): PayloadEndpointHandler =>
  withHandler(async (req, correlationID) => {
    const user = await requireReleaseApprover(req, options);
    consumeRateLimit(user.id);
    const idempotencyKey = idempotencyKeyFor(req);
    const changeRequestID = parseIdentifier(
      req.routeParams?.id,
      "change request id",
    );
    const body = await readBody(req);
    const input =
      decision === "approved"
        ? parseApproveReleaseInput(body)
        : parseRejectReleaseInput(body);
    const changeRepository = new ChangeRepository(req.payload, req);
    const releaseRepository = new ReleaseRepository(req.payload, req);
    let change = await changeRepository.getOwnedChange(
      changeRequestID,
      user.id,
    );
    const candidate =
      await releaseRepository.getLatestCandidate(changeRequestID);
    let releaseApproval = await changeRepository.getApproval(
      changeRequestID,
      "RELEASE_APPROVAL",
    );

    if (!candidate) {
      throw new EndpointError(
        "CONFLICT",
        "A verified OCI release candidate is required.",
        409,
      );
    }
    if (releaseApproval) {
      if (releaseApproval.decision !== decision) {
        throw new EndpointError(
          "CONFLICT",
          "This release already has the opposite decision.",
          409,
        );
      }
      if (
        releaseApproval.imageDigest !== input.expectedImageDigest ||
        releaseApproval.manifestHash !== input.expectedManifestHash ||
        releaseApproval.migrationSetHash !== input.expectedMigrationSetHash ||
        candidate.imageDigest !== releaseApproval.imageDigest ||
        candidate.manifestHash !== releaseApproval.manifestHash ||
        candidate.migrationSetHash !== releaseApproval.migrationSetHash
      ) {
        throw new EndpointError(
          "CONFLICT",
          "The stored release approval belongs to another artifact binding.",
          409,
        );
      }
      const currentVersion = Number(change.version || 1);
      if (
        currentVersion !== input.expectedVersion &&
        currentVersion !== input.expectedVersion + 1
      ) {
        throw new EndpointError(
          "CONFLICT",
          "The approved release version no longer matches the request.",
          409,
        );
      }
      if (candidate.status === "ready") {
        await releaseRepository.updateDecision(
          String(candidate.id),
          decision === "approved" ? "approved" : "rejected",
        );
      }
      if (change.state === "awaiting_release_approval") {
        change = await changeRepository.updateState(changeRequestID, {
          blockedReason: decision === "rejected" ? input.comment : undefined,
          state: decision === "approved" ? "release_approved" : "blocked",
          version: currentVersion + 1,
        });
      }
      return success(
        await project({ changeRequestID, options, req, userID: user.id }),
        correlationID,
      );
    }
    if (
      change.state !== "awaiting_release_approval" ||
      candidate.status !== "ready" ||
      !candidate.imageDigest ||
      !candidate.imageRef ||
      !candidate.manifestHash ||
      !candidate.sbomDigest ||
      !candidate.signatureRef ||
      !candidate.provenanceRef ||
      !candidate.migrationSetHash ||
      !candidate.configVersion ||
      !candidate.previewURL ||
      !candidate.healthSummary ||
      !candidate.evidenceHash ||
      !candidate.candidateKey ||
      !candidate.sourceAcceptanceHash ||
      !candidate.sourcePreviewArtifactHash ||
      !candidate.sourcePreviewEvidenceHash
    ) {
      throw new EndpointError(
        "CONFLICT",
        "Only a healthy, signed and fully evidenced OCI candidate can be decided.",
        409,
      );
    }
    if (Number(change.version) !== input.expectedVersion) {
      throw new EndpointError(
        "CONFLICT",
        "The Change Request version has changed. Reload before deciding.",
        409,
      );
    }
    if (
      candidate.imageDigest !== input.expectedImageDigest ||
      candidate.manifestHash !== input.expectedManifestHash ||
      candidate.migrationSetHash !== input.expectedMigrationSetHash
    ) {
      throw new EndpointError(
        "CONFLICT",
        "The release artifact no longer matches the reviewed evidence.",
        409,
      );
    }
    const expiresAt = String(candidate.expiresAt || "");
    if (Date.parse(expiresAt) <= Date.now()) {
      throw new EndpointError(
        "CONFLICT",
        "The release candidate has expired.",
        409,
      );
    }

    const candidateMigrations = releaseMigrations(candidate.migrations);
    const candidatePluginVersions = stringRecord(candidate.pluginVersions);
    const assessment = assessReleaseCandidate({
      configVersion: String(candidate.configVersion),
      evidenceHash: String(candidate.evidenceHash),
      gitCommit: String(candidate.gitCommit),
      imageDigest: String(candidate.imageDigest),
      imageRef: String(candidate.imageRef),
      manifestHash: String(candidate.manifestHash),
      migrationSetHash: String(candidate.migrationSetHash),
      migrations: candidateMigrations,
      pluginVersions: candidatePluginVersions,
      previewStatus: String(candidate.previewStatus),
      previewURL: String(candidate.previewURL),
      provenanceRef: String(candidate.provenanceRef),
      sbomDigest: String(candidate.sbomDigest),
      signatureRef: String(candidate.signatureRef),
      signatureVerified: candidate.signatureVerified === true,
    });
    if (!assessment.allowed) {
      throw new EndpointError("CONFLICT", assessment.reason, 409);
    }
    const evidenceHash = createReleaseEvidenceHash({
      candidateKey: String(candidate.candidateKey),
      configVersion: String(candidate.configVersion),
      gitCommit: String(candidate.gitCommit),
      healthSummary: String(candidate.healthSummary),
      imageDigest: String(candidate.imageDigest),
      imageRef: String(candidate.imageRef),
      manifestHash: String(candidate.manifestHash),
      migrationSetHash: String(candidate.migrationSetHash),
      migrations: candidateMigrations,
      pluginVersions: candidatePluginVersions,
      previewStatus: "healthy",
      previewURL: String(candidate.previewURL),
      provenanceRef: String(candidate.provenanceRef),
      sbomDigest: String(candidate.sbomDigest),
      signatureRef: String(candidate.signatureRef),
      signatureVerified: true,
      sourceAcceptanceHash: String(candidate.sourceAcceptanceHash),
      sourcePreviewArtifactHash: String(candidate.sourcePreviewArtifactHash),
      sourcePreviewEvidenceHash: String(candidate.sourcePreviewEvidenceHash),
    });
    if (evidenceHash !== candidate.evidenceHash) {
      throw new EndpointError(
        "CONFLICT",
        "Stored release evidence no longer matches its immutable hash.",
        409,
      );
    }

    const boundHash = createReleaseApprovalBinding({
      actorID: String(user.id),
      actorRoles: rolesOf(user),
      changeRequestID,
      decision,
      environment: "production",
      evidenceHash,
      expiresAt,
      gitCommit: String(candidate.gitCommit),
      imageDigest: String(candidate.imageDigest),
      manifestHash: String(candidate.manifestHash),
      migrationSetHash: String(candidate.migrationSetHash),
      sbomDigest: String(candidate.sbomDigest),
      signatureRef: String(candidate.signatureRef),
      version: input.expectedVersion,
    });
    try {
      releaseApproval = await changeRepository.createApproval({
        actor: user.id,
        boundHash,
        changeRequestID,
        comment: input.comment,
        decision,
        decisionKey: `${changeRequestID}:${input.expectedVersion}:RELEASE_APPROVAL`,
        expiresAt,
        idempotencyKey,
        imageDigest: String(candidate.imageDigest),
        manifestHash: String(candidate.manifestHash),
        migrationSetHash: String(candidate.migrationSetHash),
        releaseCandidateID: String(candidate.id),
        roles: rolesOf(user),
        targetEnvironment: "production",
        type: "RELEASE_APPROVAL",
      });
    } catch (error) {
      releaseApproval = await changeRepository.getApproval(
        changeRequestID,
        "RELEASE_APPROVAL",
      );
      if (!releaseApproval) throw error;
      if (releaseApproval.decision !== decision) {
        throw new EndpointError(
          "CONFLICT",
          "A concurrent request recorded the opposite release decision.",
          409,
        );
      }
    }
    await releaseRepository.updateDecision(
      String(candidate.id),
      decision === "approved" ? "approved" : "rejected",
    );
    await changeRepository.updateState(changeRequestID, {
      blockedReason: decision === "rejected" ? input.comment : undefined,
      state: decision === "approved" ? "release_approved" : "blocked",
      version: input.expectedVersion + 1,
    });
    return success(
      await project({ changeRequestID, options, req, userID: user.id }),
      correlationID,
    );
  });

/** Создаёт endpoints подготовки OCI-кандидата и отдельного release approval. */
export const createReleaseHandlers = (
  options: SanitizedRealizeAIPluginOptions,
): {
  approve: PayloadEndpointHandler;
  detail: PayloadEndpointHandler;
  prepare: PayloadEndpointHandler;
  reject: PayloadEndpointHandler;
} => ({
  approve: releaseDecisionHandler(options, "approved"),

  detail: withHandler(async (req, correlationID) => {
    const user = await requireChatUser(req, options);
    const candidateID = parseIdentifier(
      req.routeParams?.id,
      "release candidate id",
    );
    const changeRepository = new ChangeRepository(req.payload, req);
    const releaseRepository = new ReleaseRepository(req.payload, req);
    const candidate = await releaseRepository.getCandidate(candidateID);
    if (!candidate) {
      throw new EndpointError(
        "NOT_FOUND",
        "Release candidate was not found.",
        404,
      );
    }
    const changeRequestID = relationID(candidate.changeRequest);
    if (!changeRequestID) {
      throw new EndpointError(
        "INTERNAL_ERROR",
        "Release candidate has no owning Change Request.",
        500,
      );
    }
    await changeRepository.getOwnedChange(changeRequestID, user.id);
    return success(toReleaseCandidateDTO(candidate), correlationID);
  }),

  prepare: withHandler(async (req, correlationID) => {
    if (!options.release.enabled) {
      throw new EndpointError(
        "AI_DISABLED",
        "OCI release preparation is disabled.",
        409,
      );
    }
    const user = await requireChatUser(req, options);
    consumeRateLimit(user.id);
    const idempotencyKey = idempotencyKeyFor(req);
    const changeRequestID = parseIdentifier(
      req.routeParams?.id,
      "change request id",
    );
    const input = parsePrepareReleaseInput(await readBody(req));
    const changeRepository = new ChangeRepository(req.payload, req);
    const deploymentRepository = new DeploymentRepository(req.payload, req);
    const releaseRepository = new ReleaseRepository(req.payload, req);
    const change = await changeRepository.getOwnedChange(
      changeRequestID,
      user.id,
    );
    const previewAcceptance = await changeRepository.getApproval(
      changeRequestID,
      "PREVIEW_ACCEPTANCE",
    );
    const deployment =
      await deploymentRepository.getLatestDeployment(changeRequestID);
    const existing =
      (await releaseRepository.getLatestCandidate(changeRequestID)) ||
      (await releaseRepository.findByIdempotencyKey(
        changeRequestID,
        user.id,
        idempotencyKey,
      ));
    if (existing) {
      if (
        change.state === "preview_accepted" &&
        Number(change.version) === input.expectedVersion
      ) {
        await changeRepository.updateState(changeRequestID, {
          state: "release_preparing",
          version: input.expectedVersion + 1,
        });
      }
      return success(
        await project({ changeRequestID, options, req, userID: user.id }),
        correlationID,
      );
    }
    if (
      !previewAcceptance ||
      !deployment ||
      change.state !== "preview_accepted" ||
      deployment.status !== "accepted" ||
      !deployment.artifactHash ||
      !deployment.commitSHA ||
      !deployment.evidenceHash ||
      !deployment.reviewEvidenceHash
    ) {
      throw new EndpointError(
        "CONFLICT",
        "An exact accepted local preview artifact is required.",
        409,
      );
    }
    if (Number(change.version) !== input.expectedVersion) {
      throw new EndpointError(
        "CONFLICT",
        "The Change Request version has changed. Reload before release preparation.",
        409,
      );
    }
    if (deployment.artifactHash !== input.expectedPreviewArtifactHash) {
      throw new EndpointError(
        "CONFLICT",
        "The accepted preview no longer matches the requested artifact.",
        409,
      );
    }
    if (Date.parse(String(deployment.expiresAt || "")) <= Date.now()) {
      throw new EndpointError(
        "CONFLICT",
        "The accepted preview artifact has expired.",
        409,
      );
    }
    requireAcceptedPreviewBinding({
      acceptance: previewAcceptance,
      changeRequestID,
      deployment,
      expectedVersion: input.expectedVersion,
    });

    const candidateKey = createReleaseCandidateKey({
      changeRequestID,
      sourceAcceptanceHash: String(previewAcceptance.boundHash),
      sourcePreviewArtifactHash: String(deployment.artifactHash),
      sourcePreviewEvidenceHash: String(deployment.evidenceHash),
    });
    const expiresAt = new Date(
      Date.now() + options.release.ttlSeconds * 1_000,
    ).toISOString();
    try {
      await releaseRepository.createCandidate({
        candidateKey,
        changeRequestID,
        expiresAt,
        gitCommit: String(deployment.commitSHA),
        idempotencyKey,
        initiatedBy: user.id,
        previewDeploymentID: String(deployment.id),
        sourceAcceptanceHash: String(previewAcceptance.boundHash),
        sourcePreviewArtifactHash: String(deployment.artifactHash),
        sourcePreviewEvidenceHash: String(deployment.evidenceHash),
      });
    } catch (error) {
      const concurrent =
        (await releaseRepository.getLatestCandidate(changeRequestID)) ||
        (await releaseRepository.findByIdempotencyKey(
          changeRequestID,
          user.id,
          idempotencyKey,
        ));
      if (!concurrent) throw error;
    }
    await changeRepository.updateState(changeRequestID, {
      state: "release_preparing",
      version: input.expectedVersion + 1,
    });
    return success(
      await project({ changeRequestID, options, req, userID: user.id }),
      correlationID,
      202,
    );
  }),

  reject: releaseDecisionHandler(options, "rejected"),
});
