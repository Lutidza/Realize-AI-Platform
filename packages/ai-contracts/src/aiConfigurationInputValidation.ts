/**
 * @file packages/ai-contracts/src/aiConfigurationInputValidation.ts
 * @version 1.0.1
 * @date 2026-10-12
 * @description Проверяет strict mutation bodies installation configuration API.
 * @docref Realize — AI Platform v1.0 — API и streaming contracts
 * @see documentation/specifications/realize-ai-commerce/v1.0/03-runtime-delivery-and-security/22-api-and-streaming-contracts.md
 */

import type {
  ActivateAIConfigReleaseInput,
  AIConfigBaseReleaseDTO,
  CreateAIConfigDraftInput,
  CreateAIConfigReleaseInput,
  UpdateAIConfigDraftInput,
  ValidateAIConfigDraftInput,
} from "./aiConfigurationAPI";
import {
  assertSerializedSize,
  parseEnum,
  parseInteger,
  parseSHA256,
  parseStableKey,
  requireExactKeys,
  strictObject,
} from "./aiConfigurationParsingSupport";
import {
  parseAIConfigArtifact,
  parseAIConfigArtifacts,
} from "./aiConfigurationArtifactInputValidation";

const parseBaseRelease = (
  value: unknown,
  name: string,
): AIConfigBaseReleaseDTO | null => {
  if (value === null) return null;
  const input = strictObject(value, name);
  requireExactKeys(input, ["id", "manifestHash"], ["id", "manifestHash"], name);
  return {
    id: parseStableKey(input.id, `${name}.id`),
    manifestHash: parseSHA256(input.manifestHash, `${name}.manifestHash`),
  };
};

const parseSchemaVersion = (value: unknown, name: string): "1.0" =>
  parseEnum(value, ["1.0"] as const, name);

/** Validates stable config IDs used in route parameters. */
export const parseAIConfigResourceID = (
  value: unknown,
  name = "AI configuration resource id",
): string => parseStableKey(value, name);

/** Strictly parses creation of one aggregate draft. */
export const parseCreateAIConfigDraftInput = (
  value: unknown,
): CreateAIConfigDraftInput => {
  assertSerializedSize(value, "request body");
  const input = strictObject(value, "request body");
  requireExactKeys(
    input,
    [
      "artifacts",
      "baseRelease",
      "draftID",
      "expectedRevision",
      "schemaVersion",
    ],
    [
      "artifacts",
      "baseRelease",
      "draftID",
      "expectedRevision",
      "schemaVersion",
    ],
    "request body",
  );
  return {
    artifacts: parseAIConfigArtifacts(input.artifacts),
    baseRelease: parseBaseRelease(input.baseRelease, "baseRelease"),
    draftID: parseStableKey(input.draftID, "draftID"),
    expectedRevision: parseInteger(
      input.expectedRevision,
      "expectedRevision",
      0,
      0,
    ) as 0,
    schemaVersion: parseSchemaVersion(input.schemaVersion, "schemaVersion"),
  };
};

/** Strictly parses optimistic full replacement of draft artifacts. */
export const parseUpdateAIConfigDraftInput = (
  value: unknown,
): UpdateAIConfigDraftInput => {
  assertSerializedSize(value, "request body");
  const input = strictObject(value, "request body");
  requireExactKeys(
    input,
    ["artifacts", "baseRelease", "expectedRevision", "schemaVersion"],
    ["artifacts", "baseRelease", "expectedRevision", "schemaVersion"],
    "request body",
  );
  return {
    artifacts: parseAIConfigArtifacts(input.artifacts),
    baseRelease: parseBaseRelease(input.baseRelease, "baseRelease"),
    expectedRevision: parseInteger(
      input.expectedRevision,
      "expectedRevision",
      1,
    ),
    schemaVersion: parseSchemaVersion(input.schemaVersion, "schemaVersion"),
  };
};

/** Strictly parses one exact draft validation command. */
export const parseValidateAIConfigDraftInput = (
  value: unknown,
): ValidateAIConfigDraftInput => {
  const input = strictObject(value, "request body");
  requireExactKeys(
    input,
    ["draftID", "expectedRevision", "schemaVersion"],
    ["draftID", "expectedRevision", "schemaVersion"],
    "request body",
  );
  return {
    draftID: parseStableKey(input.draftID, "draftID"),
    expectedRevision: parseInteger(
      input.expectedRevision,
      "expectedRevision",
      1,
    ),
    schemaVersion: parseSchemaVersion(input.schemaVersion, "schemaVersion"),
  };
};

/** Strictly parses a hash-bound immutable release command. */
export const parseCreateAIConfigReleaseInput = (
  value: unknown,
): CreateAIConfigReleaseInput => {
  const input = strictObject(value, "request body");
  requireExactKeys(
    input,
    [
      "draftID",
      "expectedDraftRevision",
      "expectedSystemManifestHash",
      "schemaVersion",
    ],
    [
      "draftID",
      "expectedDraftRevision",
      "expectedSystemManifestHash",
      "schemaVersion",
    ],
    "request body",
  );
  return {
    draftID: parseStableKey(input.draftID, "draftID"),
    expectedDraftRevision: parseInteger(
      input.expectedDraftRevision,
      "expectedDraftRevision",
      1,
    ),
    expectedSystemManifestHash: parseSHA256(
      input.expectedSystemManifestHash,
      "expectedSystemManifestHash",
    ),
    schemaVersion: parseSchemaVersion(input.schemaVersion, "schemaVersion"),
  };
};

export { parseAIConfigArtifact, parseAIConfigArtifacts };

/** Принимает только hash-bound выбор выпуска; identity actor и новая версия принадлежат серверу. */
export const parseActivateAIConfigReleaseInput = (
  value: unknown,
): ActivateAIConfigReleaseInput => {
  const input = strictObject(value, "request body");
  const keys = [
    "action",
    "expectedPointerVersion",
    "expectedReleaseManifestHash",
    "expectedSystemManifestHash",
    "releaseID",
    "schemaVersion",
  ];
  requireExactKeys(input, keys, keys, "request body");
  return {
    action: parseEnum(
      input.action,
      ["activate", "rollback"] as const,
      "action",
    ),
    expectedPointerVersion: parseInteger(
      input.expectedPointerVersion,
      "expectedPointerVersion",
      0,
      Number.MAX_SAFE_INTEGER - 1,
    ),
    expectedReleaseManifestHash: parseSHA256(
      input.expectedReleaseManifestHash,
      "expectedReleaseManifestHash",
    ),
    expectedSystemManifestHash: parseSHA256(
      input.expectedSystemManifestHash,
      "expectedSystemManifestHash",
    ),
    releaseID: parseStableKey(input.releaseID, "releaseID"),
    schemaVersion: parseSchemaVersion(input.schemaVersion, "schemaVersion"),
  };
};
