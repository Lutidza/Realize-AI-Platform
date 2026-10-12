/**
 * @file packages/payload-ai-plugin/src/endpoints/aiConfigValidationMapper.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Проверяет bounded validation DTO из durable config event.
 * @docref Realize — AI Platform v1.0 — API и streaming contracts
 * @see documentation/specifications/realize-ai-commerce/v1.0/03-runtime-delivery-and-security/22-api-and-streaming-contracts.md
 */

import type {
  AIConfigValidationDTO,
  AIConfigValidationIssue,
} from "@realize/ai-contracts";

import {
  requireStoredKeys,
  storedHash,
  storedInteger,
  storedObject,
  storedStableID,
  storedString,
} from "./aiConfigMapperSupport";

const validationIssue = (
  value: unknown,
  index: number,
): AIConfigValidationIssue => {
  const issue = storedObject(value, `validation issue ${index}`);
  requireStoredKeys(
    issue,
    ["code", "message", "path"],
    ["code", "message", "path"],
    `validation issue ${index}`,
  );
  return {
    code: storedStableID(issue.code, `validation issue ${index} code`),
    message: storedString(issue.message, `validation issue ${index} message`),
    path: storedString(issue.path, `validation issue ${index} path`),
  };
};

/** Parses only the exact validation response fields persisted by the server. */
export const parseAIConfigValidationDTO = (
  value: unknown,
): AIConfigValidationDTO => {
  const input = storedObject(value, "validation response snapshot");
  requireStoredKeys(
    input,
    [
      "checkedRevision",
      "draftID",
      "issues",
      "resultingRevision",
      "state",
      "systemManifestHash",
      "valid",
    ],
    [
      "checkedRevision",
      "draftID",
      "issues",
      "resultingRevision",
      "state",
      "systemManifestHash",
      "valid",
    ],
    "validation response snapshot",
  );
  if (!Array.isArray(input.issues) || input.issues.length > 512) {
    throw new Error("Stored AI configuration validation issues are invalid.");
  }
  if (
    typeof input.valid !== "boolean" ||
    (input.state !== "editing" && input.state !== "ready")
  ) {
    throw new Error("Stored AI configuration validation result is invalid.");
  }
  return {
    checkedRevision: storedInteger(input.checkedRevision, "checked revision"),
    draftID: storedStableID(input.draftID, "validation draft id"),
    issues: input.issues.map(validationIssue),
    resultingRevision: storedInteger(
      input.resultingRevision,
      "validation resulting revision",
    ),
    state: input.state,
    systemManifestHash: storedHash(
      input.systemManifestHash,
      "validation system manifest hash",
    ),
    valid: input.valid,
  };
};
