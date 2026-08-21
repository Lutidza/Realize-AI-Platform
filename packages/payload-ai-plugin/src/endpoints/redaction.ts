/**
 * @file packages/payload-ai-plugin/src/endpoints/redaction.ts
 * @version 2026-08-17
 * @description Redacts common credential signatures before persistence or display.
 */

const signatures: RegExp[] = [
  /\bsk-(?:proj-)?[A-Za-z0-9_-]{12,}\b/g,
  /\bgh[oprsu]_[A-Za-z0-9]{20,}\b/g,
  /\bsk_live_[A-Za-z0-9]{12,}\b/g,
  /-----BEGIN [^-]+ PRIVATE KEY-----[\s\S]*?-----END [^-]+ PRIVATE KEY-----/g,
];

export const redactText = (value: string): string => {
  return signatures.reduce(
    (result, signature) => result.replace(signature, "[REDACTED]"),
    value,
  );
};

const redactValue = (value: unknown): unknown => {
  if (typeof value === "string") return redactText(value);
  if (Array.isArray(value)) return value.map(redactValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, redactValue(nested)]),
    );
  }
  return value;
};

export const redactPayload = (
  payload: Record<string, unknown>,
): Record<string, unknown> => {
  return Object.fromEntries(
    Object.entries(payload).map(([key, value]) => [key, redactValue(value)]),
  );
};
