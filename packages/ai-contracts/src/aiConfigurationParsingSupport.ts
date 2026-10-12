/**
 * @file packages/ai-contracts/src/aiConfigurationParsingSupport.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Предоставляет bounded strict parsing primitives configuration API.
 * @docref Realize — AI Platform v1.0 — API и streaming contracts
 * @see documentation/specifications/realize-ai-commerce/v1.0/03-runtime-delivery-and-security/22-api-and-streaming-contracts.md
 */

import type { JSONValue } from "./workflows";
import { ContractValidationError } from "./validation";

const STABLE_KEY = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const VERSION = /^\d+\.\d+(?:\.\d+)?$/;
const SHA256 = /^[a-f0-9]{64}$/;

export const strictObject = (
  value: unknown,
  name: string,
): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ContractValidationError(`${name} must be a JSON object.`);
  }
  return value as Record<string, unknown>;
};

export const requireExactKeys = (
  value: Record<string, unknown>,
  allowed: readonly string[],
  required: readonly string[],
  name: string,
): void => {
  const unexpected = Object.keys(value).find((key) => !allowed.includes(key));
  if (unexpected) {
    throw new ContractValidationError(
      `${name} contains unsupported field: ${unexpected}.`,
    );
  }
  const missing = required.find((key) => !Object.hasOwn(value, key));
  if (missing) {
    throw new ContractValidationError(`${name}.${missing} is required.`);
  }
};

export const parseString = (
  value: unknown,
  name: string,
  maximum: number,
  minimum = 0,
): string => {
  if (
    typeof value !== "string" ||
    value.length < minimum ||
    value.length > maximum
  ) {
    throw new ContractValidationError(
      `${name} must be a string containing between ${minimum} and ${maximum} characters.`,
    );
  }
  return value;
};

export const parseStableKey = (value: unknown, name: string): string => {
  if (typeof value !== "string" || !STABLE_KEY.test(value)) {
    throw new ContractValidationError(`${name} must be a stable identifier.`);
  }
  return value;
};

export const parseVersion = (value: unknown, name: string): string => {
  if (typeof value !== "string" || !VERSION.test(value)) {
    throw new ContractValidationError(`${name} must be a numeric version.`);
  }
  return value;
};

export const parseSHA256 = (value: unknown, name: string): string => {
  if (typeof value !== "string" || !SHA256.test(value)) {
    throw new ContractValidationError(`${name} must be a SHA-256 hash.`);
  }
  return value;
};

export const parseInteger = (
  value: unknown,
  name: string,
  minimum: number,
  maximum = Number.MAX_SAFE_INTEGER,
): number => {
  if (
    !Number.isSafeInteger(value) ||
    Number(value) < minimum ||
    Number(value) > maximum
  ) {
    throw new ContractValidationError(
      `${name} must be an integer between ${minimum} and ${maximum}.`,
    );
  }
  return Number(value);
};

export const parseBoolean = (value: unknown, name: string): boolean => {
  if (typeof value !== "boolean") {
    throw new ContractValidationError(`${name} must be a boolean.`);
  }
  return value;
};

export const parseEnum = <TValue extends string>(
  value: unknown,
  allowed: readonly TValue[],
  name: string,
): TValue => {
  if (typeof value !== "string" || !allowed.includes(value as TValue)) {
    throw new ContractValidationError(`${name} is not supported.`);
  }
  return value as TValue;
};

export const parseStringArray = (
  value: unknown,
  name: string,
  maximumItems = 128,
): readonly string[] => {
  if (!Array.isArray(value) || value.length > maximumItems) {
    throw new ContractValidationError(
      `${name} must be an array with at most ${maximumItems} items.`,
    );
  }
  return value.map((item, index) => parseStableKey(item, `${name}[${index}]`));
};

export const assertSerializedSize = (
  value: unknown,
  name: string,
  maximum = 2_000_000,
): void => {
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw new ContractValidationError(`${name} must be JSON serializable.`);
  }
  if (serialized.length > maximum) {
    throw new ContractValidationError(
      `${name} must not exceed ${maximum} serialized characters.`,
    );
  }
};

/** Clones one bounded JSON value while rejecting non-finite/runtime values. */
export const parseJSONValue = (
  value: unknown,
  name: string,
  depth = 0,
): JSONValue => {
  if (depth > 12) {
    throw new ContractValidationError(`${name} exceeds maximum JSON depth.`);
  }
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "string") return parseString(value, name, 32_000);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new ContractValidationError(`${name} must be a finite number.`);
    }
    return value;
  }
  if (Array.isArray(value)) {
    if (value.length > 256) {
      throw new ContractValidationError(`${name} contains too many items.`);
    }
    return value.map((item, index) =>
      parseJSONValue(item, `${name}[${index}]`, depth + 1),
    );
  }
  const object = strictObject(value, name);
  const entries = Object.entries(object);
  if (entries.length > 128) {
    throw new ContractValidationError(`${name} contains too many fields.`);
  }
  return Object.fromEntries(
    entries.map(([key, child]) => [
      parseStableKey(key, `${name} field`),
      parseJSONValue(child, `${name}.${key}`, depth + 1),
    ]),
  );
};
