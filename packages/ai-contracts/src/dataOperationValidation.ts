/**
 * @file packages/ai-contracts/src/dataOperationValidation.ts
 * @version 2026-08-28
 * @description Проверяет недоверенный assistant protocol и HTTP input Data Lane.
 * @docref Realize AI Commerce v1.0 — Data/Config Pipeline
 * @see documentation/specifications/realize-ai-commerce/v1.0/02-change-engine-and-pipelines/14-data-config-pipeline.md
 */

import type {
  ApplyDataOperationInput,
  AssignProductCategoryIntent,
  CreateDataOperationInput,
  DataEntitySelector,
  DataRollbackInput,
  DecideDataOperationInput,
} from "./dataOperations";
import { ContractValidationError, parseIdentifier } from "./validation";

const asObject = (value: unknown, name: string): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ContractValidationError(`${name} must be a JSON object.`);
  }
  return value as Record<string, unknown>;
};

const requireExactKeys = (
  value: Record<string, unknown>,
  allowed: string[],
  name: string,
): void => {
  const unexpected = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unexpected.length > 0) {
    throw new ContractValidationError(
      `${name} contains unsupported field: ${unexpected[0]}.`,
    );
  }
};

const parseSelector = (value: unknown, name: string): DataEntitySelector => {
  const selector = asObject(value, name);
  requireExactKeys(selector, ["id", "slug", "title"], name);
  const present = ["id", "slug", "title"].filter(
    (key) => selector[key] !== undefined,
  );
  if (present.length !== 1) {
    throw new ContractValidationError(
      `${name} must contain exactly one of id, slug or title.`,
    );
  }
  const key = present[0] as "id" | "slug" | "title";
  const raw = selector[key];
  if (typeof raw !== "string") {
    throw new ContractValidationError(`${name}.${key} must be a string.`);
  }
  const normalized = raw.trim();
  if (normalized.length < 1 || normalized.length > 160) {
    throw new ContractValidationError(
      `${name}.${key} must contain between 1 and 160 characters.`,
    );
  }
  if (key === "id") return { id: parseIdentifier(normalized, `${name} id`) };
  if (key === "slug") {
    if (!/^[\p{L}\p{N}][\p{L}\p{N}._-]{0,159}$/u.test(normalized)) {
      throw new ContractValidationError(`${name}.slug is invalid.`);
    }
    return { slug: normalized };
  }
  return { title: normalized };
};

const parseExpectedVersion = (value: unknown): number => {
  if (!Number.isInteger(value) || Number(value) < 1) {
    throw new ContractValidationError(
      "expectedVersion must be a positive integer.",
    );
  }
  return Number(value);
};

const parseHash = (value: unknown, name: string): string => {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) {
    throw new ContractValidationError(`${name} must be a SHA-256 hash.`);
  }
  return value;
};

const parseComment = (
  value: unknown,
  required: boolean,
): string | undefined => {
  if (value === undefined && !required) return undefined;
  if (typeof value !== "string") {
    throw new ContractValidationError("comment must be a string.");
  }
  const comment = value.trim();
  if (comment.length < (required ? 3 : 0) || comment.length > 1_000) {
    throw new ContractValidationError(
      required
        ? "comment must contain between 3 and 1000 characters."
        : "comment must not exceed 1000 characters.",
    );
  }
  return comment || undefined;
};

/** Parses the only executable declarative intent supported in the first slice. */
export const parseAssignProductCategoryIntent = (
  value: unknown,
): AssignProductCategoryIntent => {
  const input = asObject(value, "data operation");
  requireExactKeys(
    input,
    ["category", "kind", "product", "version"],
    "data operation",
  );
  if (input.version !== "1.0") {
    throw new ContractValidationError(
      'data operation version must equal "1.0".',
    );
  }
  if (input.kind !== "catalog.assignCategory.v1") {
    throw new ContractValidationError("data operation kind is not supported.");
  }
  return {
    category: parseSelector(input.category, "category selector"),
    kind: "catalog.assignCategory.v1",
    product: parseSelector(input.product, "product selector"),
    version: "1.0",
  };
};

/** Validates selection of the persisted assistant source message. */
export const parseCreateDataOperationInput = (
  value: unknown,
): CreateDataOperationInput => {
  const input = asObject(value, "request body");
  requireExactKeys(input, ["sourceMessageID"], "request body");
  return {
    sourceMessageID: parseIdentifier(
      input.sourceMessageID,
      "source message id",
    ),
  };
};

/** Validates one exact main-operation approval or rejection. */
export const parseDecideDataOperationInput = (
  value: unknown,
  commentRequired = false,
): DecideDataOperationInput => {
  const input = asObject(value, "request body");
  requireExactKeys(
    input,
    ["comment", "expectedOperationHash", "expectedVersion"],
    "request body",
  );
  const comment = parseComment(input.comment, commentRequired);
  return {
    ...(comment ? { comment } : {}),
    expectedOperationHash: parseHash(
      input.expectedOperationHash,
      "expectedOperationHash",
    ),
    expectedVersion: parseExpectedVersion(input.expectedVersion),
  };
};

/** Validates execution of one exact approved operation. */
export const parseApplyDataOperationInput = (
  value: unknown,
): ApplyDataOperationInput => {
  const input = asObject(value, "request body");
  requireExactKeys(
    input,
    ["expectedOperationHash", "expectedVersion"],
    "request body",
  );
  return {
    expectedOperationHash: parseHash(
      input.expectedOperationHash,
      "expectedOperationHash",
    ),
    expectedVersion: parseExpectedVersion(input.expectedVersion),
  };
};

/** Validates rollback approval or execution against an exact snapshot hash. */
export const parseDataRollbackInput = (value: unknown): DataRollbackInput => {
  const input = asObject(value, "request body");
  requireExactKeys(
    input,
    ["comment", "expectedRollbackHash", "expectedVersion"],
    "request body",
  );
  const comment = parseComment(input.comment, false);
  return {
    ...(comment ? { comment } : {}),
    expectedRollbackHash: parseHash(
      input.expectedRollbackHash,
      "expectedRollbackHash",
    ),
    expectedVersion: parseExpectedVersion(input.expectedVersion),
  };
};
