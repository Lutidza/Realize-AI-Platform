// @vitest-environment node

/**
 * @file tests/int/integration-runtime.int.spec.ts
 * @version 2026-08-28
 * @docref ADR-0012
 * @see documentation/architecture/decisions/ADR-0012-admin-integration-registry.md
 * @description Проверяет безопасный DTO и общее серверное получение credential.
 */

import { randomBytes } from "node:crypto";

import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";

import { toGitHubIntegrationDTO } from "../../packages/payload-ai-plugin/src/endpoints/integrationMappers";
import { encryptIntegrationCredential } from "@realize/payload-ai-control/server/integration-vault";
import {
  IntegrationRuntimeError,
  IntegrationRuntimeRepository,
} from "@realize/payload-ai-control/server/integration-runtime";

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

  it("расшифровывает через серверный export и читает актуальную revision при каждом вызове", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [row] })
      .mockResolvedValueOnce({ rows: [{ ...row, revision: "4" }] });
    const repository = new IntegrationRuntimeRepository(
      { query } as unknown as Pick<Pool, "query">,
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
    await expect(repository.resolvePrimaryGitHub()).resolves.toEqual({
      defaultBranch: "main",
      repositorySlug: "realize/store",
      revision: 4,
      state: "ready",
      token,
    });
    expect(query).toHaveBeenCalledTimes(2);
  });

  it.each([
    { state: "absent", rows: [] },
    {
      state: "disabled",
      rows: [
        {
          ...row,
          enabled: false,
          credential_envelope: "invalid fixture envelope",
        },
      ],
    },
  ])("возвращает $state без ключа vault", async ({ state, rows }) => {
    const repository = new IntegrationRuntimeRepository(
      { query: vi.fn().mockResolvedValue({ rows }) } as unknown as Pick<
        Pool,
        "query"
      >,
      undefined,
    );
    await expect(repository.resolvePrimaryGitHub()).resolves.toEqual({
      state,
    });
  });

  it("возвращает безопасную ошибку конфигурации для сохранённого некорректного URL", async () => {
    const invalidURL = new URL(row.configuration.repositoryURL);
    invalidURL.username = "fixture-user";
    invalidURL.password = "fixture-password";
    const repository = new IntegrationRuntimeRepository(
      {
        query: vi.fn().mockResolvedValue({
          rows: [
            {
              ...row,
              configuration: {
                ...row.configuration,
                repositoryURL: invalidURL.href,
              },
            },
          ],
        }),
      } as unknown as Pick<Pool, "query">,
      encryptionKey,
    );
    const error = await repository
      .resolvePrimaryGitHub()
      .catch((failure: unknown) => failure);
    expect(error).toBeInstanceOf(IntegrationRuntimeError);
    expect(String(error)).not.toContain(invalidURL.href);
    expect(String(error)).not.toContain("fixture-password");
    expect(error).not.toHaveProperty("cause");
  });

  it.each([
    { label: "provider", value: { ...row, provider: "other-provider" } },
    {
      label: "connectionKey",
      value: { ...row, connection_key: "github:other" },
    },
    {
      label: "repositorySlug",
      value: {
        ...row,
        configuration: {
          ...row.configuration,
          repositorySlug: "other/repository",
        },
      },
    },
    {
      label: "revision",
      value: { ...row, revision: Number.MAX_SAFE_INTEGER + 1 },
    },
    {
      label: "credential_envelope",
      value: { ...row, credential_envelope: null },
    },
  ])(
    "отклоняет некорректный $label без раскрытия credential",
    async ({ value }) => {
      const repository = new IntegrationRuntimeRepository(
        {
          query: vi.fn().mockResolvedValue({ rows: [value] }),
        } as unknown as Pick<Pool, "query">,
        encryptionKey,
      );
      const error = await repository
        .resolvePrimaryGitHub()
        .catch((failure: unknown) => failure);
      expect(error).toBeInstanceOf(IntegrationRuntimeError);
      expect(String(error)).not.toContain(token);
      expect(String(error)).not.toContain(envelope);
      expect(String(error)).not.toContain(encryptionKey);
      expect(error).not.toHaveProperty("cause");
    },
  );

  it.each([
    { label: "отсутствующий", key: undefined },
    { label: "неверный", key: randomBytes(32).toString("base64") },
  ])("блокирует включённое подключение: $label ключ vault", async ({ key }) => {
    const repository = new IntegrationRuntimeRepository(
      {
        query: vi.fn().mockResolvedValue({ rows: [row] }),
      } as unknown as Pick<Pool, "query">,
      key,
    );
    const error = await repository
      .resolvePrimaryGitHub()
      .catch((failure: unknown) => failure);
    expect(error).toBeInstanceOf(IntegrationRuntimeError);
    expect(String(error)).not.toContain(token);
    expect(String(error)).not.toContain(envelope);
    expect(error).not.toHaveProperty("cause");
  });

  it("скрывает детали сбоя БД и сохраняет отличие от ошибки конфигурации", async () => {
    const sensitiveFixture = "synthetic database credential diagnostic";
    const query = vi.fn().mockRejectedValue(new Error(sensitiveFixture));
    const repository = new IntegrationRuntimeRepository(
      { query } as unknown as Pick<Pool, "query">,
      encryptionKey,
    );
    const error = await repository
      .resolvePrimaryGitHub()
      .catch((failure: unknown) => failure);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(IntegrationRuntimeError);
    expect(error).toHaveProperty(
      "message",
      "Integration registry is unavailable.",
    );
    expect(error).not.toHaveProperty("cause");
    expect(String(error)).not.toContain(sensitiveFixture);
    expect(JSON.stringify(error)).not.toContain(sensitiveFixture);
  });
});
