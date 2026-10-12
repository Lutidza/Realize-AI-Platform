/**
 * @file packages/payload-ai-plugin/src/endpoints/aiConfigDraftMapper.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Проецирует hidden config draft documents в explicit DTO/domain input.
 * @docref Realize — AI Platform v1.0 — API и streaming contracts
 * @see documentation/specifications/realize-ai-commerce/v1.0/03-runtime-delivery-and-security/22-api-and-streaming-contracts.md
 */

import {
  parseAIConfigArtifacts,
  type AIConfigBaseReleaseDTO,
  type AIConfigDraft,
  type AIConfigDraftDTO,
  type AIConfigDraftSummaryDTO,
} from "@realize/ai-contracts";

import {
  requireStoredKeys,
  storedActorID,
  storedHash,
  storedInteger,
  storedObject,
  storedStableID,
  storedString,
  storedTimestamp,
} from "./aiConfigMapperSupport";
import type { AIDocument } from "./repository";

const draftStates = ["editing", "ready", "released", "validating"] as const;

const storedState = (value: unknown): AIConfigDraftSummaryDTO["state"] => {
  if (!draftStates.includes(value as (typeof draftStates)[number])) {
    throw new Error("Stored AI configuration draft state is invalid.");
  }
  return value as AIConfigDraftSummaryDTO["state"];
};

const baseReleaseFromDocument = (
  document: Record<string, unknown>,
): AIConfigBaseReleaseDTO | undefined => {
  const baseReleaseID = document.baseReleaseID;
  const baseReleaseManifestHash = document.baseReleaseManifestHash;
  const idAbsent = baseReleaseID === undefined || baseReleaseID === null;
  const hashAbsent =
    baseReleaseManifestHash === undefined || baseReleaseManifestHash === null;

  if (idAbsent && hashAbsent) return undefined;
  if (idAbsent || hashAbsent) {
    throw new Error("Stored AI configuration base release is invalid.");
  }
  return {
    id: storedStableID(baseReleaseID, "base release id"),
    manifestHash: storedHash(baseReleaseManifestHash, "base release hash"),
  };
};

/** Returns the authorized full draft without Payload metadata leakage. */
export const toAIConfigDraftDTO = (document: AIDocument): AIConfigDraftDTO => {
  const artifacts = parseAIConfigArtifacts(
    document.artifacts,
    "stored draft artifacts",
  );
  const baseRelease = baseReleaseFromDocument(document);
  return {
    artifactCount: artifacts.length,
    artifacts,
    ...(baseRelease ? { baseRelease } : {}),
    createdAt: storedTimestamp(document.createdAt, "draft createdAt"),
    createdBy: storedActorID(document.createdBy, "draft createdBy"),
    id: storedStableID(document.draftID, "draft id"),
    revision: storedInteger(document.revision, "draft revision"),
    schemaVersion:
      storedString(document.schemaVersion, "draft schemaVersion") === "1.0"
        ? "1.0"
        : (() => {
            throw new Error(
              "Stored AI configuration schemaVersion is invalid.",
            );
          })(),
    state: storedState(document.state),
    updatedAt: storedTimestamp(document.updatedAt, "draft updatedAt"),
    updatedBy: storedActorID(document.updatedBy, "draft updatedBy"),
  };
};

/** Strips large artifacts for list and durable replay responses. */
export const toAIConfigDraftSummaryDTO = (
  document: AIDocument,
): AIConfigDraftSummaryDTO => {
  const { artifacts: _artifacts, ...summary } = toAIConfigDraftDTO(document);
  return summary;
};

/** Reconstructs only the pure Change Engine draft contract. */
export const toAIConfigDraft = (document: AIDocument): AIConfigDraft => {
  const dto = toAIConfigDraftDTO(document);
  return {
    artifacts: dto.artifacts,
    ...(dto.baseRelease ? { baseRelease: dto.baseRelease } : {}),
    id: dto.id,
    revision: dto.revision,
    schemaVersion: dto.schemaVersion,
    state: dto.state,
  };
};

/** Parses the bounded summary stored in an idempotency event. */
export const parseAIConfigDraftSummaryDTO = (
  value: unknown,
): AIConfigDraftSummaryDTO => {
  const input = storedObject(value, "draft response snapshot");
  requireStoredKeys(
    input,
    [
      "artifactCount",
      "baseRelease",
      "createdAt",
      "createdBy",
      "id",
      "revision",
      "schemaVersion",
      "state",
      "updatedAt",
      "updatedBy",
    ],
    [
      "artifactCount",
      "createdAt",
      "createdBy",
      "id",
      "revision",
      "schemaVersion",
      "state",
      "updatedAt",
      "updatedBy",
    ],
    "draft response snapshot",
  );
  const base = input.baseRelease;
  const baseRelease =
    base === undefined
      ? undefined
      : (() => {
          const relation = storedObject(base, "draft base release snapshot");
          requireStoredKeys(
            relation,
            ["id", "manifestHash"],
            ["id", "manifestHash"],
            "draft base release snapshot",
          );
          return {
            id: storedStableID(relation.id, "draft base release id"),
            manifestHash: storedHash(
              relation.manifestHash,
              "draft base release hash",
            ),
          };
        })();
  if (input.schemaVersion !== "1.0") {
    throw new Error("Stored AI configuration schemaVersion is invalid.");
  }
  return {
    artifactCount: storedInteger(input.artifactCount, "draft artifactCount", 0),
    ...(baseRelease ? { baseRelease } : {}),
    createdAt: storedTimestamp(input.createdAt, "draft createdAt"),
    createdBy: storedStableID(input.createdBy, "draft createdBy"),
    id: storedStableID(input.id, "draft id"),
    revision: storedInteger(input.revision, "draft revision"),
    schemaVersion: "1.0",
    state: storedState(input.state),
    updatedAt: storedTimestamp(input.updatedAt, "draft updatedAt"),
    updatedBy: storedStableID(input.updatedBy, "draft updatedBy"),
  };
};
