/**
 * @file packages/change-engine/src/aiConfigurationRelease.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Создаёт и проверяет immutable installation AI configuration releases.
 * @docref Realize — AI Platform v1.0 — AI plugin data model
 * @see documentation/specifications/realize-ai-commerce/v1.0/03-runtime-delivery-and-security/21-ai-plugin-data-model.md
 */

import type {
  ActiveAIConfigPointer,
  AIConfigArtifactSnapshot,
  AIConfigDraft,
  AIConfigRelease,
} from "@realize/ai-contracts";

import { AIConfigurationPolicyError } from "./aiConfigurationError";
import { hashCanonicalJSON } from "./canonicalJson";
import { validateAIConfigDraft } from "./aiConfigurationValidation";

const STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const VERSION = /^\d+\.\d+(?:\.\d+)?$/;
const SHA256 = /^[a-f0-9]{64}$/;

const compareVersions = (left: string, right: string): number => {
  const leftParts = left.split(".").map(Number);
  const rightParts = right.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    const difference = (leftParts[index] || 0) - (rightParts[index] || 0);
    if (difference !== 0) return difference;
  }
  return 0;
};

const isCanonicalTimestamp = (value: string): boolean => {
  const timestamp = new Date(value);
  return (
    !Number.isNaN(timestamp.valueOf()) && timestamp.toISOString() === value
  );
};

const artifactIdentity = (snapshot: AIConfigArtifactSnapshot): string =>
  `${snapshot.artifact.kind}:${snapshot.artifact.key}`;

const deepFreeze = <T>(value: T): T => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value;
};

const manifestPayload = (
  release: Omit<AIConfigRelease, "manifestHash">,
): Omit<AIConfigRelease, "manifestHash"> => ({
  artifacts: release.artifacts,
  createdAt: release.createdAt,
  createdBy: release.createdBy,
  id: release.id,
  schemaVersion: release.schemaVersion,
  sourceDraftID: release.sourceDraftID,
  sourceDraftRevision: release.sourceDraftRevision,
  systemCompatibility: release.systemCompatibility,
  version: release.version,
});

const requireMetadata = (input: {
  createdAt: string;
  createdBy: string;
  releaseID: string;
  releaseVersion: number;
  systemCompatibility: AIConfigRelease["systemCompatibility"];
}): void => {
  if (!STABLE_ID.test(input.releaseID) || !STABLE_ID.test(input.createdBy)) {
    throw new AIConfigurationPolicyError(
      "Release id and creator must be stable non-empty values.",
    );
  }
  if (!Number.isInteger(input.releaseVersion) || input.releaseVersion < 1) {
    throw new AIConfigurationPolicyError(
      "Release version must be a positive integer.",
    );
  }
  if (!isCanonicalTimestamp(input.createdAt)) {
    throw new AIConfigurationPolicyError(
      "Release createdAt must be a canonical UTC timestamp.",
    );
  }
  const { maximumRelease, minimumRelease } = input.systemCompatibility;
  if (
    !VERSION.test(minimumRelease) ||
    (maximumRelease !== undefined && !VERSION.test(maximumRelease)) ||
    (maximumRelease !== undefined &&
      compareVersions(minimumRelease, maximumRelease) > 0)
  ) {
    throw new AIConfigurationPolicyError(
      "System compatibility must use numeric release versions.",
    );
  }
};

/** Создаёт detached, sorted и content-addressed snapshot из ready draft. */
export const createAIConfigRelease = (input: {
  createdAt: string;
  createdBy: string;
  draft: AIConfigDraft;
  releaseID: string;
  releaseVersion: number;
  systemCompatibility: AIConfigRelease["systemCompatibility"];
}): AIConfigRelease => {
  requireMetadata(input);
  if (input.draft.state !== "ready") {
    throw new AIConfigurationPolicyError(
      "Only a ready AI configuration draft can be released.",
    );
  }
  const validation = validateAIConfigDraft(input.draft);
  if (!validation.valid) {
    throw new AIConfigurationPolicyError(
      "AI configuration draft validation failed.",
      validation.issues,
    );
  }

  const artifacts: AIConfigArtifactSnapshot[] = [...input.draft.artifacts]
    .sort((left, right) => {
      const leftKey = `${left.kind}:${left.key}`;
      const rightKey = `${right.kind}:${right.key}`;
      return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
    })
    .map((source) => {
      const artifact = structuredClone(source);
      return {
        artifact,
        contentHash: hashCanonicalJSON(artifact),
      };
    });
  const payload = manifestPayload({
    artifacts,
    createdAt: input.createdAt,
    createdBy: input.createdBy,
    id: input.releaseID,
    schemaVersion: "1.0",
    sourceDraftID: input.draft.id,
    sourceDraftRevision: input.draft.revision,
    systemCompatibility: structuredClone(input.systemCompatibility),
    version: input.releaseVersion,
  });

  return deepFreeze({
    ...payload,
    manifestHash: hashCanonicalJSON(payload),
  });
};

/** Проверяет artifact hashes и общий manifest hash immutable release. */
export const verifyAIConfigRelease = (release: AIConfigRelease): boolean => {
  try {
    requireMetadata({
      createdAt: release.createdAt,
      createdBy: release.createdBy,
      releaseID: release.id,
      releaseVersion: release.version,
      systemCompatibility: release.systemCompatibility,
    });
    if (
      release.schemaVersion !== "1.0" ||
      !STABLE_ID.test(release.sourceDraftID) ||
      !Number.isInteger(release.sourceDraftRevision) ||
      release.sourceDraftRevision < 1 ||
      !SHA256.test(release.manifestHash)
    ) {
      return false;
    }
    let previousIdentity: string | undefined;
    if (
      release.artifacts.some((snapshot) => {
        const currentIdentity = artifactIdentity(snapshot);
        const outOfOrder =
          previousIdentity !== undefined && previousIdentity >= currentIdentity;
        previousIdentity = currentIdentity;
        return (
          outOfOrder ||
          !SHA256.test(snapshot.contentHash) ||
          hashCanonicalJSON(snapshot.artifact) !== snapshot.contentHash
        );
      })
    ) {
      return false;
    }
    const validation = validateAIConfigDraft({
      artifacts: release.artifacts.map(({ artifact }) => artifact),
      id: release.sourceDraftID,
      revision: release.sourceDraftRevision,
      schemaVersion: release.schemaVersion,
      state: "ready",
    });
    if (!validation.valid) return false;
    const { manifestHash, ...payload } = release;
    return hashCanonicalJSON(payload) === manifestHash;
  } catch {
    return false;
  }
};

/** Создаёт следующий exact release pointer для transactional persistence. */
export const createActiveAIConfigPointer = (input: {
  activatedAt: string;
  activatedBy: string;
  previous?: ActiveAIConfigPointer;
  release: AIConfigRelease;
}): ActiveAIConfigPointer => {
  if (!verifyAIConfigRelease(input.release)) {
    throw new AIConfigurationPolicyError(
      "Cannot activate an invalid AI configuration release.",
    );
  }
  if (
    !STABLE_ID.test(input.activatedBy) ||
    !isCanonicalTimestamp(input.activatedAt) ||
    (input.previous !== undefined &&
      (!Number.isInteger(input.previous.version) || input.previous.version < 1))
  ) {
    throw new AIConfigurationPolicyError(
      "Activation actor and timestamp must be valid.",
    );
  }
  return deepFreeze({
    activatedAt: input.activatedAt,
    activatedBy: input.activatedBy,
    manifestHash: input.release.manifestHash,
    releaseID: input.release.id,
    version: (input.previous?.version || 0) + 1,
  });
};
