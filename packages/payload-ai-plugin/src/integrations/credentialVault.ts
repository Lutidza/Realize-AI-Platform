/**
 * @file packages/payload-ai-plugin/src/integrations/credentialVault.ts
 * @version 2026-08-27
 * @docref ADR-0012
 * @see documentation/architecture/decisions/ADR-0012-admin-integration-registry.md
 * @description Implements a versioned AES-256-GCM envelope for write-only credentials.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;

type CredentialBinding = {
  connectionKey: string;
  provider: string;
};

type CredentialEnvelope = {
  algorithm: "A256GCM";
  ciphertext: string;
  iv: string;
  tag: string;
  version: 1;
};

/** Expected failure for unavailable or invalid local vault configuration. */
export class IntegrationVaultError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IntegrationVaultError";
  }
}

const decodeCanonicalBase64 = (
  value: unknown,
  name: string,
  expectedBytes?: number,
): Buffer => {
  if (typeof value !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    throw new IntegrationVaultError(`${name} is invalid.`);
  }
  const decoded = Buffer.from(value, "base64");
  if (
    decoded.toString("base64") !== value ||
    (expectedBytes !== undefined && decoded.length !== expectedBytes)
  ) {
    throw new IntegrationVaultError(`${name} is invalid.`);
  }
  return decoded;
};

const keyFrom = (value: string | undefined): Buffer => {
  if (!value) {
    throw new IntegrationVaultError(
      "Integration credential vault is not configured.",
    );
  }
  return decodeCanonicalBase64(value, "Integration encryption key", KEY_BYTES);
};

const authenticatedData = (binding: CredentialBinding): Buffer =>
  Buffer.from(
    JSON.stringify({
      connectionKey: binding.connectionKey,
      provider: binding.provider,
      version: 1,
    }),
    "utf8",
  );

const parseEnvelope = (value: string): CredentialEnvelope => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new IntegrationVaultError(
      "Integration credential envelope is invalid.",
    );
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new IntegrationVaultError(
      "Integration credential envelope is invalid.",
    );
  }
  const envelope = parsed as Record<string, unknown>;
  if (envelope.version !== 1 || envelope.algorithm !== "A256GCM") {
    throw new IntegrationVaultError(
      "Integration credential envelope version is unsupported.",
    );
  }
  decodeCanonicalBase64(envelope.iv, "Credential IV", IV_BYTES);
  decodeCanonicalBase64(envelope.tag, "Credential tag", TAG_BYTES);
  decodeCanonicalBase64(envelope.ciphertext, "Credential ciphertext");
  return envelope as CredentialEnvelope;
};

/** Returns whether the named master key is available without exposing its value. */
export const isIntegrationVaultConfigured = (
  environmentName: string,
): boolean => {
  try {
    const key = keyFrom(process.env[environmentName]);
    key.fill(0);
    return true;
  } catch {
    return false;
  }
};

/** Encrypts one credential with provider and connection identity as AAD. */
export const encryptIntegrationCredential = (input: {
  binding: CredentialBinding;
  encryptionKey: string | undefined;
  plaintext: string;
}): string => {
  const key = keyFrom(input.encryptionKey);
  try {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    cipher.setAAD(authenticatedData(input.binding));
    const ciphertext = Buffer.concat([
      cipher.update(input.plaintext, "utf8"),
      cipher.final(),
    ]);
    const envelope: CredentialEnvelope = {
      algorithm: "A256GCM",
      ciphertext: ciphertext.toString("base64"),
      iv: iv.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      version: 1,
    };
    return JSON.stringify(envelope);
  } finally {
    key.fill(0);
  }
};

/** Decrypts an envelope only for its exact provider/connection binding. */
export const decryptIntegrationCredential = (input: {
  binding: CredentialBinding;
  encryptionKey: string | undefined;
  envelope: string;
}): string => {
  const key = keyFrom(input.encryptionKey);
  try {
    const envelope = parseEnvelope(input.envelope);
    const decipher = createDecipheriv(
      ALGORITHM,
      key,
      decodeCanonicalBase64(envelope.iv, "Credential IV", IV_BYTES),
    );
    decipher.setAAD(authenticatedData(input.binding));
    decipher.setAuthTag(
      decodeCanonicalBase64(envelope.tag, "Credential tag", TAG_BYTES),
    );
    return Buffer.concat([
      decipher.update(
        decodeCanonicalBase64(envelope.ciphertext, "Credential ciphertext"),
      ),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new IntegrationVaultError(
      "Integration credential could not be decrypted.",
    );
  } finally {
    key.fill(0);
  }
};
