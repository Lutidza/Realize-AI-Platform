// @vitest-environment node

/**
 * @file tests/int/integration-vault.int.spec.ts
 * @version 2026-08-27
 * @docref ADR-0012
 * @see documentation/architecture/decisions/ADR-0012-admin-integration-registry.md
 * @description Verifies authenticated write-only credential envelopes and binding.
 */

import { randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  decryptIntegrationCredential,
  encryptIntegrationCredential,
  IntegrationVaultError,
} from "@realize/payload-ai-control/server/integration-vault";

const encryptionKey = randomBytes(32).toString("base64");
const binding = { connectionKey: "github:primary", provider: "github" };

describe("integration credential vault", () => {
  it("round-trips a credential without storing plaintext", () => {
    const token = "integration-sensitive-test-token-123456789";
    const envelope = encryptIntegrationCredential({
      binding,
      encryptionKey,
      plaintext: token,
    });

    expect(envelope).not.toContain(token);
    expect(
      decryptIntegrationCredential({ binding, encryptionKey, envelope }),
    ).toBe(token);
  });

  it("rejects another connection binding and invalid master key", () => {
    const envelope = encryptIntegrationCredential({
      binding,
      encryptionKey,
      plaintext: "integration-sensitive-test-token-123456789",
    });

    expect(() =>
      decryptIntegrationCredential({
        binding: { connectionKey: "github:secondary", provider: "github" },
        encryptionKey,
        envelope,
      }),
    ).toThrow(IntegrationVaultError);
    expect(() =>
      decryptIntegrationCredential({
        binding,
        encryptionKey: "invalid",
        envelope,
      }),
    ).toThrow(IntegrationVaultError);
  });
});
