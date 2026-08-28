// @vitest-environment node

/**
 * @file tests/int/integration-runtime.int.spec.ts
 * @version 2026-08-28
 * @docref ADR-0012
 * @see documentation/architecture/decisions/ADR-0012-admin-integration-registry.md
 * @description Verifies safe DTO mapping and revision-bound worker credential resolution.
 */

import { randomBytes } from "node:crypto";

import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";

import { toGitHubIntegrationDTO } from "../../packages/payload-ai-plugin/src/endpoints/integrationMappers";
import { encryptIntegrationCredential } from "@realize/payload-ai-control/server/integration-vault";
import {
  IntegrationRuntimeError,
  IntegrationWorkerRepository,
} from "../../services/ai-execution-worker/src/integrationRepository";

const encryptionKey = randomBytes(32).toString("base64");
const token = "integration-worker-only-test-token-123456789";
const envelope = encryptIntegrationCredential({
  binding: { connectionKey: "github:primary", provider: "github" },
  encryptionKey,
  plaintext: token,
});

const row = {
  configuration: {
    defaultBranch: "main",
    repositorySlug: "realize/store",
    repositoryURL: "https://github.com/realize/store",
  },
  connection_key: "github:primary",
  credential_envelope: envelope,
  enabled: true,
  provider: "github",
  revision: 3,
};

describe("integration runtime boundary", () => {
  it("maps a hidden document without credential material", () => {
    const dto = toGitHubIntegrationDTO({
      configuration: row.configuration,
      connectionKey: row.connection_key,
      credentialEnvelope: envelope,
      credentialUpdatedAt: "2026-08-27T00:00:00.000Z",
      displayName: "Основной GitHub",
      enabled: true,
      id: 7,
      lastTestStatus: "never",
      provider: "github",
      revision: 1,
      updatedAt: "2026-08-27T00:00:00.000Z",
    });

    expect(dto.hasCredential).toBe(true);
    expect(JSON.stringify(dto)).not.toContain(token);
    expect(dto).not.toHaveProperty("credentialEnvelope");
  });

  it("decrypts an enabled connection only inside the worker repository", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [row] });
    const repository = new IntegrationWorkerRepository(
      { query } as unknown as Pool,
      encryptionKey,
    );

    await expect(repository.resolvePrimaryGitHub()).resolves.toEqual({
      defaultBranch: "main",
      repositorySlug: "realize/store",
      revision: 3,
      state: "ready",
      token,
    });
    expect(query).toHaveBeenCalledWith(expect.stringContaining("LIMIT 1"), [
      "github:primary",
    ]);
  });

  it("blocks disabled or undecryptable configured connections", async () => {
    const disabled = new IntegrationWorkerRepository(
      {
        query: vi.fn().mockResolvedValue({
          rows: [{ ...row, enabled: false }],
        }),
      } as unknown as Pool,
      encryptionKey,
    );
    await expect(disabled.resolvePrimaryGitHub()).resolves.toEqual({
      state: "disabled",
    });

    const wrongKey = new IntegrationWorkerRepository(
      { query: vi.fn().mockResolvedValue({ rows: [row] }) } as unknown as Pool,
      randomBytes(32).toString("base64"),
    );
    await expect(wrongKey.resolvePrimaryGitHub()).rejects.toThrow(
      IntegrationRuntimeError,
    );
  });
});
