/**
 * @file packages/ai-contracts/src/parseAIChatConfigurationSnapshotShape.validator.ts
 * @version 1.0.0
 * @date 2026-09-10
 * @description Строго разбирает ограниченный закрытый снимок перед проверкой хешей в Change Engine.
 * @see documentation/specifications/realize-ai-commerce/v1.0/03-runtime-delivery-and-security/22-api-and-streaming-contracts.md
 */

import type { AIChatConfigurationSnapshot } from "./AIChatConfiguration.types";
import type {
  AIConfigArtifactSnapshot,
  ResolvedCapabilityBinding,
} from "./aiConfiguration";
import { parseAIConfigArtifact } from "./aiConfigurationArtifactInputValidation";
import {
  parseEnum,
  parseInteger,
  parseSHA256,
  parseStableKey,
  parseStringArray,
  parseVersion,
  requireExactKeys,
  strictObject,
} from "./aiConfigurationParsingSupport";
import { ContractValidationError } from "./validation";

const MAX_SERIALIZED_CHARACTERS = 2_000_000;
const MAX_SERIALIZED_BYTES = 8 * 1024 * 1024;

const parseArray = <T>(
  value: unknown,
  name: string,
  parse: (item: unknown, path: string) => T,
): readonly T[] => {
  if (!Array.isArray(value) || value.length > 512) {
    throw new ContractValidationError(
      `${name} must contain at most 512 items.`,
    );
  }
  return value.map((item, index) => parse(item, `${name}[${index}]`));
};

const parseArtifactSnapshot = (
  value: unknown,
  name: string,
): AIConfigArtifactSnapshot => {
  const input = strictObject(value, name);
  requireExactKeys(
    input,
    ["artifact", "contentHash"],
    ["artifact", "contentHash"],
    name,
  );
  return {
    artifact: parseAIConfigArtifact(input.artifact, `${name}.artifact`),
    contentHash: parseSHA256(input.contentHash, `${name}.contentHash`),
  };
};

const parseCapability = (
  value: unknown,
  name: string,
): ResolvedCapabilityBinding => {
  const input = strictObject(value, name);
  const keys = [
    "actions",
    "bindingKey",
    "capability",
    "maxTargets",
    "readScopes",
    "writeScopes",
  ];
  requireExactKeys(input, keys, keys, name);
  const capability = strictObject(input.capability, `${name}.capability`);
  requireExactKeys(
    capability,
    ["id", "version"],
    ["id", "version"],
    `${name}.capability`,
  );
  return {
    actions: parseStringArray(input.actions, `${name}.actions`),
    bindingKey: parseStableKey(input.bindingKey, `${name}.bindingKey`),
    capability: {
      id: parseStableKey(capability.id, `${name}.capability.id`),
      version: parseVersion(capability.version, `${name}.capability.version`),
    },
    maxTargets: parseInteger(input.maxTargets, `${name}.maxTargets`, 1),
    readScopes: parseStringArray(input.readScopes, `${name}.readScopes`),
    writeScopes: parseStringArray(input.writeScopes, `${name}.writeScopes`),
  };
};

/** Проверяет только форму и размер; перед использованием сервер обязан проверить целостность снимка. */
export const parseAIChatConfigurationSnapshotShape = (
  value: unknown,
): AIChatConfigurationSnapshot => {
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw new ContractValidationError(
      "Agent configuration snapshot must be JSON serializable.",
    );
  }
  if (
    !serialized ||
    serialized.length > MAX_SERIALIZED_CHARACTERS ||
    new TextEncoder().encode(serialized).byteLength > MAX_SERIALIZED_BYTES
  ) {
    throw new ContractValidationError(
      "Agent configuration snapshot exceeds serialized size limits.",
    );
  }

  const input = strictObject(value, "agentConfiguration");
  const keys = [
    "schemaVersion",
    "pointerVersion",
    "releaseVersion",
    "compiled",
  ];
  requireExactKeys(input, keys, keys, "agentConfiguration");
  const compiled = strictObject(input.compiled, "compiled");
  const compiledKeys = [
    "capabilities",
    "checkIDs",
    "compiledContextHash",
    "configManifestHash",
    "configReleaseID",
    "profile",
    "projectProfile",
    "selectedArtifacts",
    "selectedArtifactHashes",
    "systemManifestHash",
    "systemReleaseID",
    "systemVersion",
  ];
  requireExactKeys(compiled, compiledKeys, compiledKeys, "compiled");
  const profile = parseAIConfigArtifact(compiled.profile, "compiled.profile");
  if (profile.kind !== "agent_profile") {
    throw new ContractValidationError(
      "compiled.profile must be an agent profile.",
    );
  }
  return {
    schemaVersion: parseEnum(input.schemaVersion, ["1.0"], "schemaVersion"),
    pointerVersion: parseInteger(input.pointerVersion, "pointerVersion", 1),
    releaseVersion: parseInteger(input.releaseVersion, "releaseVersion", 1),
    compiled: {
      capabilities: parseArray(
        compiled.capabilities,
        "compiled.capabilities",
        parseCapability,
      ),
      checkIDs: parseStringArray(compiled.checkIDs, "compiled.checkIDs", 512),
      compiledContextHash: parseSHA256(
        compiled.compiledContextHash,
        "compiled.compiledContextHash",
      ),
      configManifestHash: parseSHA256(
        compiled.configManifestHash,
        "compiled.configManifestHash",
      ),
      configReleaseID: parseStableKey(
        compiled.configReleaseID,
        "compiled.configReleaseID",
      ),
      profile,
      projectProfile: parseStableKey(
        compiled.projectProfile,
        "compiled.projectProfile",
      ),
      selectedArtifacts: parseArray(
        compiled.selectedArtifacts,
        "compiled.selectedArtifacts",
        parseArtifactSnapshot,
      ),
      selectedArtifactHashes: parseArray(
        compiled.selectedArtifactHashes,
        "compiled.selectedArtifactHashes",
        parseSHA256,
      ),
      systemManifestHash: parseSHA256(
        compiled.systemManifestHash,
        "compiled.systemManifestHash",
      ),
      systemReleaseID: parseStableKey(
        compiled.systemReleaseID,
        "compiled.systemReleaseID",
      ),
      systemVersion: parseVersion(
        compiled.systemVersion,
        "compiled.systemVersion",
      ),
    },
  };
};
