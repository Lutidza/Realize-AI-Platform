/**
 * @file packages/payload-ai-plugin/src/endpoints/aiConfigMapperSupport.ts
 * @version 2026-09-01
 * @description Проверяет stored config fields до построения explicit DTO.
 * @docref Realize AI Commerce v1.0 — API и streaming contracts
 * @see documentation/specifications/realize-ai-commerce/v1.0/03-runtime-delivery-and-security/22-api-and-streaming-contracts.md
 */

import { relationID } from "./mappers";

const STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const VERSION = /^\d+\.\d+(?:\.\d+)?$/;

export const storedObject = (
  value: unknown,
  name: string,
): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Stored AI configuration ${name} is invalid.`);
  }
  return value as Record<string, unknown>;
};

export const requireStoredKeys = (
  value: Record<string, unknown>,
  allowed: readonly string[],
  required: readonly string[],
  name: string,
): void => {
  if (
    Object.keys(value).some((key) => !allowed.includes(key)) ||
    required.some((key) => !Object.hasOwn(value, key))
  ) {
    throw new Error(`Stored AI configuration ${name} is invalid.`);
  }
};

export const storedString = (value: unknown, name: string): string => {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Stored AI configuration ${name} is invalid.`);
  }
  return value;
};

export const storedStableID = (value: unknown, name: string): string => {
  const result = storedString(value, name);
  if (!STABLE_ID.test(result)) {
    throw new Error(`Stored AI configuration ${name} is invalid.`);
  }
  return result;
};

export const storedActorID = (value: unknown, name: string): string => {
  const result = relationID(value);
  if (!STABLE_ID.test(result)) {
    throw new Error(`Stored AI configuration ${name} is invalid.`);
  }
  return result;
};

export const storedHash = (value: unknown, name: string): string => {
  const result = storedString(value, name);
  if (!SHA256.test(result)) {
    throw new Error(`Stored AI configuration ${name} is invalid.`);
  }
  return result;
};

export const storedVersion = (value: unknown, name: string): string => {
  const result = storedString(value, name);
  if (!VERSION.test(result)) {
    throw new Error(`Stored AI configuration ${name} is invalid.`);
  }
  return result;
};

export const storedInteger = (
  value: unknown,
  name: string,
  minimum = 1,
): number => {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < minimum) {
    throw new Error(`Stored AI configuration ${name} is invalid.`);
  }
  return result;
};

export const storedTimestamp = (value: unknown, name: string): string => {
  const result = storedString(value, name);
  const timestamp = new Date(result);
  if (Number.isNaN(timestamp.valueOf()) || timestamp.toISOString() !== result) {
    throw new Error(`Stored AI configuration ${name} is invalid.`);
  }
  return result;
};
