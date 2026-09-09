// @vitest-environment node

/**
 * @file tests/int/integration-runtime.int.spec.ts
 * @version 1.1.0
 * @date 2026-09-09
 * @description Проверяет получение GitHub-подключения и защиту учётных данных.
 * @docref ADR-0012
 * @see documentation/architecture/decisions/ADR-0012-admin-integration-registry.md
 */

import { randomBytes } from "node:crypto";

import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";

import { toGitHubIntegrationDTO } from "../../packages/payload-ai-plugin/src/endpoints/integrationMappers";
import { encryptIntegrationCredential } from "@realize/payload-ai-control/server/integration-vault";
import {
  GitHubConnectionService,
  GitRepositoryConnectionService,
  IntegrationRuntimeError,
  IntegrationRuntimeRepository,
} from "@realize/payload-ai-control/server/integration-runtime";
import {
  ContractValidationError,
  parseGitIntegrationTransport,
  parseSaveGitHubIntegrationInput,
} from "@realize/ai-contracts";

const encryptionKey = randomBytes(32).toString("base64");
const TOKEN = "integration-worker-only-test-token-123456789";
const envelope = encryptIntegrationCredential({
  binding: { connectionKey: "github:primary", provider: "github" },
  encryptionKey,
  plaintext: TOKEN,
});

describe("Git transport integration", () => {
  const serviceFor = (
    rows: unknown[],
    key: string | undefined = encryptionKey,
  ) =>
    new GitRepositoryConnectionService(
      new IntegrationRuntimeRepository({
        query: vi.fn().mockResolvedValue({ rows }),
      } as unknown as Pick<Pool, "query">),
      key,
    );

  it.each([undefined, "https"])(
    "разрешает HTTPS transport=%s из текущей записи",
    async (transport) => {
      const service = serviceFor([
        {
          ...row,
          configuration: {
            ...row.configuration,
            repositoryURL: "https://www.github.com/realize/store.git",
            ...(transport ? { transport } : {}),
          },
        },
      ]);
      await expect(
        service.resolvePrimaryGitRepository(),
      ).resolves.toStrictEqual({
        connectionKey: "github:primary",
        repositorySlug: "realize/store",
        repositoryURL: "https://github.com/realize/store",
        revision: 3,
        state: "ready",
        token: TOKEN,
        transport: "https",
      });
    },
  );

  it.each([null, "invalid cipher fixture"])(
    "SSH не требует vault и не расшифровывает credential=%s",
    async (credential) => {
      const service = serviceFor(
        [
          {
            ...row,
            configuration: {
              ...row.configuration,
              transport: "ssh",
              sshProfileRef: "delivery-main_1",
            },
            credential_envelope: credential,
          },
        ],
        "not-a-key",
      );
      await expect(
        service.resolvePrimaryGitRepository(),
      ).resolves.toStrictEqual({
        connectionKey: "github:primary",
        repositorySlug: "realize/store",
        repositoryURL: "https://github.com/realize/store",
        revision: 3,
        sshProfileRef: "delivery-main_1",
        state: "ready",
        transport: "ssh",
      });
    },
  );

  it("не кэширует смену транспорта, профиля и revision", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [row] })
      .mockResolvedValueOnce({
        rows: [
          {
            ...row,
            configuration: {
              ...row.configuration,
              transport: "ssh",
              sshProfileRef: "delivery-next",
            },
            credential_envelope: null,
            revision: "4",
          },
        ],
      });
    const service = new GitRepositoryConnectionService(
      new IntegrationRuntimeRepository({ query } as unknown as Pick<
        Pool,
        "query"
      >),
      encryptionKey,
    );
    await expect(service.resolvePrimaryGitRepository()).resolves.toMatchObject({
      transport: "https",
      revision: 3,
    });
    await expect(service.resolvePrimaryGitRepository()).resolves.toMatchObject({
      transport: "ssh",
      revision: 4,
      sshProfileRef: "delivery-next",
    });
    expect(query).toHaveBeenCalledTimes(2);
  });

  it.each([
    { rows: [], state: "absent" },
    {
      rows: [
        {
          ...row,
          enabled: false,
          configuration: null,
          credential_envelope: null,
        },
      ],
      state: "disabled",
    },
  ])("возвращает $state без credential", async ({ rows, state }) => {
    await expect(
      serviceFor(rows, "not-a-key").resolvePrimaryGitRepository(),
    ).resolves.toEqual({ state });
  });

  it.each([
    { transport: "file" },
    { transport: null },
    { transport: "SSH", sshProfileRef: "main" },
    { transport: "https", sshProfileRef: "main" },
    { sshProfileRef: "main" },
    { transport: "ssh" },
    { transport: "ssh", sshProfileRef: "" },
    { transport: "ssh", sshProfileRef: "a".repeat(65) },
    { transport: "ssh", sshProfileRef: "../key" },
    { transport: "ssh", sshProfileRef: "/home/key" },
    { transport: "ssh", sshProfileRef: "host.example" },
    { transport: "ssh", sshProfileRef: "main -oProxyCommand" },
    { transport: "ssh", sshProfileRef: "main\n" },
  ])(
    "save и runtime одинаково отклоняют $transport/$sshProfileRef",
    async (transport) => {
      expect(() => parseGitIntegrationTransport(transport)).toThrow(
        ContractValidationError,
      );
      expect(() =>
        parseSaveGitHubIntegrationInput({
          enabled: true,
          expectedRevision: 0,
          repositoryURL: row.configuration.repositoryURL,
          ...transport,
        }),
      ).toThrow(ContractValidationError);
      await expect(
        serviceFor([
          {
            ...row,
            configuration: { ...row.configuration, ...transport },
          },
        ]).resolvePrimaryGitRepository(),
      ).rejects.toThrow(IntegrationRuntimeError);
    },
  );

  it("принимает предельный профиль, но не дополняет старый save input transport", () => {
    expect(
      parseGitIntegrationTransport({
        transport: "ssh",
        sshProfileRef: "a".repeat(64),
      }),
    ).toEqual({
      transport: "ssh",
      sshProfileRef: "a".repeat(64),
    });
    expect(
      parseSaveGitHubIntegrationInput({
        enabled: true,
        expectedRevision: 3,
        repositoryURL: row.configuration.repositoryURL,
      }),
    ).not.toHaveProperty("transport");
  });

  it.each([null, ""])(
    "HTTPS без credential=%s отклоняется безопасно",
    async (credential) => {
      await expect(
        serviceFor([
          { ...row, credential_envelope: credential },
        ]).resolvePrimaryGitRepository(),
      ).rejects.toThrow("HTTPS Git integration has no credential.");
    },
  );

  it("скрывает ошибку vault для HTTPS", async () => {
    const error = await serviceFor([row], "not-a-key")
      .resolvePrimaryGitRepository()
      .catch((value: unknown) => value);
    expect(error).toBeInstanceOf(IntegrationRuntimeError);
    expect(String(error)).not.toContain("not-a-key");
    expect(String(error)).not.toContain(envelope);
    expect(error).not.toHaveProperty("cause");
  });

  it("SSH не заменяет API token для REST resolver", async () => {
    const rows = [
      {
        ...row,
        configuration: {
          ...row.configuration,
          transport: "ssh",
          sshProfileRef: "main",
        },
      },
    ];
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows })
      .mockResolvedValueOnce({
        rows: [{ ...rows[0], credential_envelope: null }],
      });
    const rest = new GitHubConnectionService(
      new IntegrationRuntimeRepository({ query } as unknown as Pick<
        Pool,
        "query"
      >),
      encryptionKey,
    );
    await expect(rest.resolvePrimaryGitHub()).resolves.toEqual({
      defaultBranch: "main",
      repositorySlug: "realize/store",
      revision: 3,
      state: "ready",
      token: TOKEN,
    });
    await expect(rest.resolvePrimaryGitHub()).rejects.toThrow(
      "Enabled GitHub integration has no credential.",
    );
  });
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
    expect(JSON.stringify(dto)).not.toContain(TOKEN);
    expect(dto).not.toHaveProperty("credentialEnvelope");
  });

  it("читает актуальные revision, конфигурацию и credential при каждом вызове сервиса", async () => {
    const updatedToken = "integration-rotated-test-token-987654321";
    const updatedEnvelope = encryptIntegrationCredential({
      binding: { connectionKey: "github:primary", provider: "github" },
      encryptionKey,
      plaintext: updatedToken,
    });
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [row] })
      .mockResolvedValueOnce({
        rows: [
          {
            ...row,
            configuration: {
              repositorySlug: "realize/updated-store",
              repositoryURL: "https://github.com/realize/updated-store",
            },
            credential_envelope: updatedEnvelope,
            revision: "4",
          },
        ],
      });
    const service = new GitHubConnectionService(
      new IntegrationRuntimeRepository({ query } as unknown as Pick<
        Pool,
        "query"
      >),
      encryptionKey,
    );

    await expect(service.resolvePrimaryGitHub()).resolves.toEqual({
      defaultBranch: "main",
      repositorySlug: "realize/store",
      revision: 3,
      state: "ready",
      token: TOKEN,
    });
    expect(query).toHaveBeenCalledWith(
      expect.stringMatching(/\bWHERE\s+connection_key\s*=\s*\$1\s+LIMIT\s+1\b/),
      ["github:primary"],
    );
    await expect(service.resolvePrimaryGitHub()).resolves.toStrictEqual({
      repositorySlug: "realize/updated-store",
      revision: 4,
      state: "ready",
      token: updatedToken,
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
          configuration: null,
          enabled: false,
          credential_envelope: "invalid fixture envelope",
          revision: 0,
        },
      ],
    },
  ])(
    "возвращает $state до проверки конфигурации и ключа vault",
    async ({ state, rows }) => {
      const service = new GitHubConnectionService(
        new IntegrationRuntimeRepository({
          query: vi.fn().mockResolvedValue({ rows }),
        } as unknown as Pick<Pool, "query">),
        undefined,
      );
      await expect(service.resolvePrimaryGitHub()).resolves.toEqual({
        state,
      });
    },
  );

  it("возвращает безопасную ошибку конфигурации для сохранённого некорректного URL", async () => {
    const invalidURL = new URL(row.configuration.repositoryURL);
    invalidURL.username = "fixture-user";
    invalidURL.password = "fixture-password";
    const service = new GitHubConnectionService(
      new IntegrationRuntimeRepository({
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
      } as unknown as Pick<Pool, "query">),
      encryptionKey,
    );
    const error = await service
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
      label: "provider отключённого подключения",
      value: { ...row, enabled: false, provider: "other-provider" },
    },
    {
      label: "connectionKey",
      value: { ...row, connection_key: "github:other" },
    },
    { label: "configuration (null)", value: { ...row, configuration: null } },
    { label: "configuration (массив)", value: { ...row, configuration: [] } },
    {
      label: "defaultBranch",
      value: {
        ...row,
        configuration: {
          ...row.configuration,
          defaultBranch: "feature/../main",
        },
      },
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
      const service = new GitHubConnectionService(
        new IntegrationRuntimeRepository({
          query: vi.fn().mockResolvedValue({ rows: [value] }),
        } as unknown as Pick<Pool, "query">),
        encryptionKey,
      );
      const error = await service
        .resolvePrimaryGitHub()
        .catch((failure: unknown) => failure);
      expect(error).toBeInstanceOf(IntegrationRuntimeError);
      expect(String(error)).not.toContain(TOKEN);
      expect(String(error)).not.toContain(envelope);
      expect(String(error)).not.toContain(encryptionKey);
      expect(error).not.toHaveProperty("cause");
    },
  );

  it.each([
    { label: "отсутствующий", key: undefined },
    { label: "неверный", key: randomBytes(32).toString("base64") },
  ])("блокирует включённое подключение: $label ключ vault", async ({ key }) => {
    const service = new GitHubConnectionService(
      new IntegrationRuntimeRepository({
        query: vi.fn().mockResolvedValue({ rows: [row] }),
      } as unknown as Pick<Pool, "query">),
      key,
    );
    const error = await service
      .resolvePrimaryGitHub()
      .catch((failure: unknown) => failure);
    expect(error).toBeInstanceOf(IntegrationRuntimeError);
    expect(String(error)).not.toContain(TOKEN);
    expect(String(error)).not.toContain(envelope);
    expect(error).not.toHaveProperty("cause");
  });

  it("скрывает детали сбоя БД и сохраняет отличие от ошибки конфигурации", async () => {
    const sensitiveFixture = "synthetic database credential diagnostic";
    const query = vi.fn().mockRejectedValue(new Error(sensitiveFixture));
    const service = new GitHubConnectionService(
      new IntegrationRuntimeRepository({ query } as unknown as Pick<
        Pool,
        "query"
      >),
      encryptionKey,
    );
    const error = await service
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
