/**
 * @file packages/change-engine/src/system-ai/aiExecutionContext.service.ts
 * @version 1.0.0
 * @date 2026-10-04
 * @description Связывает исходный run и его policy с Change Request и execution capability.
 */
import type { AIExecutionContextSnapshot } from "@realize/ai-contracts";
import { hashCanonicalJSON } from "../canonicalJson";
import { AIConfigurationPolicyError } from "../aiConfigurationError";
import { assertRuntimeAIConfiguration } from "./assertRuntimeAIConfiguration.validator";
import { requireSystemAIRelease } from "./systemAIRelease.registry";

export const createAIExecutionContext = (
  input: Omit<AIExecutionContextSnapshot, "schemaVersion" | "contextHash">,
): AIExecutionContextSnapshot =>
  parseAIExecutionContext({
    ...input,
    schemaVersion: "1.0",
    contextHash: hashCanonicalJSON({ ...input, schemaVersion: "1.0" }),
  });

/** Исторический snapshot можно читать отдельно; для исполнения нет legacy/latest fallback. */
export const parseAIExecutionContext = (
  value: unknown,
): AIExecutionContextSnapshot => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new AIConfigurationPolicyError(
      "Execution requires the original system/overlay context. Create a new plan.",
    );
  const input = value as AIExecutionContextSnapshot;
  const { contextHash, ...payload } = input;
  if (
    Object.keys(input).some(
      (key) =>
        ![
          "schemaVersion",
          "systemRelease",
          "agentConfiguration",
          "sourceRunID",
          "inputContextHash",
          "originalRequestHash",
          "contextHash",
        ].includes(key),
    ) ||
    input.schemaVersion !== "1.0" ||
    typeof input.sourceRunID !== "string" ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(input.sourceRunID) ||
    typeof input.inputContextHash !== "string" ||
    !/^[a-f0-9]{64}$/.test(input.inputContextHash) ||
    typeof input.originalRequestHash !== "string" ||
    !/^[a-f0-9]{64}$/.test(input.originalRequestHash) ||
    typeof contextHash !== "string" ||
    hashCanonicalJSON(payload) !== contextHash
  )
    throw new AIConfigurationPolicyError(
      "Execution context failed integrity verification.",
    );
  const system = requireSystemAIRelease(input.systemRelease);
  const agentConfiguration = assertRuntimeAIConfiguration(
    input.systemRelease,
    input.agentConfiguration,
  );
  return Object.freeze({
    schemaVersion: "1.0",
    systemRelease: Object.freeze({
      releaseID: system.releaseID,
      manifestHash: system.manifestHash,
    }),
    ...(agentConfiguration ? { agentConfiguration } : {}),
    sourceRunID: input.sourceRunID,
    inputContextHash: input.inputContextHash,
    originalRequestHash: input.originalRequestHash,
    contextHash,
  });
};
