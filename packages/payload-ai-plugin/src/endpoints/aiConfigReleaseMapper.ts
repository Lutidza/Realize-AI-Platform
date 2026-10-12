/**
 * @file packages/payload-ai-plugin/src/endpoints/aiConfigReleaseMapper.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Проверяет immutable release snapshots и строит explicit DTO.
 * @docref Realize — AI Platform v1.0 — API и streaming contracts
 * @see documentation/specifications/realize-ai-commerce/v1.0/03-runtime-delivery-and-security/22-api-and-streaming-contracts.md
 */

import {
  parseAIConfigArtifact,
  type AIConfigArtifactSnapshot,
  type AIConfigReleaseDTO,
  type AIConfigReleaseSummaryDTO,
} from "@realize/ai-contracts";
import { verifyAIConfigRelease } from "@realize/change-engine";

import {
  requireStoredKeys,
  storedActorID,
  storedHash,
  storedInteger,
  storedObject,
  storedStableID,
  storedTimestamp,
  storedVersion,
} from "./aiConfigMapperSupport";
import type { AIDocument } from "./repository";

const snapshotsFrom = (value: unknown): readonly AIConfigArtifactSnapshot[] => {
  if (!Array.isArray(value) || value.length > 512) {
    throw new Error("Stored AI configuration release artifacts are invalid.");
  }
  return value.map((item, index) => {
    const snapshot = storedObject(item, `release artifact ${index}`);
    requireStoredKeys(
      snapshot,
      ["artifact", "contentHash"],
      ["artifact", "contentHash"],
      `release artifact ${index}`,
    );
    return {
      artifact: parseAIConfigArtifact(
        snapshot.artifact,
        `stored release artifact ${index}`,
      ),
      contentHash: storedHash(
        snapshot.contentHash,
        `release artifact ${index} hash`,
      ),
    };
  });
};

/** Reconstructs and cryptographically verifies one immutable release. */
export const toAIConfigReleaseDTO = (
  document: AIDocument,
): AIConfigReleaseDTO => {
  if (document.schemaVersion !== "1.0") {
    throw new Error(
      "Stored AI configuration release schemaVersion is invalid.",
    );
  }
  const maximumRelease =
    document.systemMaximumRelease === undefined ||
    document.systemMaximumRelease === null
      ? undefined
      : storedVersion(
          document.systemMaximumRelease,
          "release maximum system version",
        );
  const release: AIConfigReleaseDTO = {
    artifacts: snapshotsFrom(document.artifacts),
    createdAt: storedTimestamp(document.releasedAt, "release createdAt"),
    createdBy: storedActorID(document.createdBy, "release createdBy"),
    id: storedStableID(document.releaseID, "release id"),
    manifestHash: storedHash(document.manifestHash, "release manifest hash"),
    schemaVersion: "1.0",
    sourceDraftID: storedStableID(
      document.sourceDraftID,
      "release source draft id",
    ),
    sourceDraftRevision: storedInteger(
      document.sourceDraftRevision,
      "release source draft revision",
    ),
    systemCompatibility: {
      ...(maximumRelease ? { maximumRelease } : {}),
      minimumRelease: storedVersion(
        document.systemMinimumRelease,
        "release minimum system version",
      ),
    },
    version: storedInteger(document.version, "release version"),
  };
  if (!verifyAIConfigRelease(release)) {
    throw new Error("Stored AI configuration release verification failed.");
  }
  return release;
};

/** Removes large artifacts while preserving all hash-bound release metadata. */
export const toAIConfigReleaseSummaryDTO = (
  document: AIDocument,
): AIConfigReleaseSummaryDTO => {
  const release = toAIConfigReleaseDTO(document);
  return {
    artifactCount: release.artifacts.length,
    createdAt: release.createdAt,
    createdBy: release.createdBy,
    id: release.id,
    manifestHash: release.manifestHash,
    schemaVersion: release.schemaVersion,
    sourceDraftID: release.sourceDraftID,
    sourceDraftRevision: release.sourceDraftRevision,
    systemCompatibility: release.systemCompatibility,
    version: release.version,
  };
};

/** Parses the bounded release summary stored in an idempotency event. */
export const parseAIConfigReleaseSummaryDTO = (
  value: unknown,
): AIConfigReleaseSummaryDTO => {
  const input = storedObject(value, "release response snapshot");
  requireStoredKeys(
    input,
    [
      "artifactCount",
      "createdAt",
      "createdBy",
      "id",
      "manifestHash",
      "schemaVersion",
      "sourceDraftID",
      "sourceDraftRevision",
      "systemCompatibility",
      "version",
    ],
    [
      "artifactCount",
      "createdAt",
      "createdBy",
      "id",
      "manifestHash",
      "schemaVersion",
      "sourceDraftID",
      "sourceDraftRevision",
      "systemCompatibility",
      "version",
    ],
    "release response snapshot",
  );
  if (input.schemaVersion !== "1.0") {
    throw new Error("Stored release response schemaVersion is invalid.");
  }
  const compatibility = storedObject(
    input.systemCompatibility,
    "release compatibility snapshot",
  );
  requireStoredKeys(
    compatibility,
    ["maximumRelease", "minimumRelease"],
    ["minimumRelease"],
    "release compatibility snapshot",
  );
  const maximumRelease =
    compatibility.maximumRelease === undefined ||
    compatibility.maximumRelease === null
      ? undefined
      : storedVersion(
          compatibility.maximumRelease,
          "release maximum system version",
        );
  return {
    artifactCount: storedInteger(
      input.artifactCount,
      "release artifactCount",
      0,
    ),
    createdAt: storedTimestamp(input.createdAt, "release createdAt"),
    createdBy: storedStableID(input.createdBy, "release createdBy"),
    id: storedStableID(input.id, "release id"),
    manifestHash: storedHash(input.manifestHash, "release manifest hash"),
    schemaVersion: "1.0",
    sourceDraftID: storedStableID(input.sourceDraftID, "source draft id"),
    sourceDraftRevision: storedInteger(
      input.sourceDraftRevision,
      "source draft revision",
    ),
    systemCompatibility: {
      ...(maximumRelease ? { maximumRelease } : {}),
      minimumRelease: storedVersion(
        compatibility.minimumRelease,
        "release minimum system version",
      ),
    },
    version: storedInteger(input.version, "release version"),
  };
};
