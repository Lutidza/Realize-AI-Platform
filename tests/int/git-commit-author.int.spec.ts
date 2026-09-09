// @vitest-environment node

/**
 * @file tests/int/git-commit-author.int.spec.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Проверяет единый контракт автора коммитов и чтение интеграции без credential.
 */

import { describe, expect, it, vi } from "vitest";

import {
  ContractValidationError,
  parseGitCommitAuthor,
  parseGitHubIntegrationConfiguration,
  parseSaveGitHubIntegrationInput,
} from "@realize/ai-contracts";
import {
  GitCommitAuthorService,
  IntegrationRuntimeError,
  IntegrationRuntimeRepository,
} from "@realize/payload-ai-control/server/integration-runtime";
import type { GitHubIntegrationRow } from "../../packages/payload-ai-plugin/src/integrations/runtime/IntegrationRuntime.types";

const author = { name: "Разработчик Realize", email: "developer@example.com" };
const configuration = {
  repositoryURL: "https://github.com/realize/store",
  repositorySlug: "realize/store",
};
const saveInput = {
  enabled: true,
  expectedRevision: 0,
  repositoryURL: configuration.repositoryURL,
};
const row = (commitAuthor: unknown = author): GitHubIntegrationRow => ({
  configuration: { ...configuration, commitAuthor },
  connection_key: "github:primary",
  credential_envelope: null,
  enabled: true,
  provider: "github",
  revision: "3",
});

describe("Git commit author contract", () => {
  it("нормализует пробелы и возвращает отдельную пару полей", () => {
    const input = {
      name: `  ${author.name}  `,
      email: `  ${author.email}  `,
    };
    expect(parseGitCommitAuthor(input)).toStrictEqual(author);
    expect(
      parseSaveGitHubIntegrationInput({ ...saveInput, commitAuthor: input }),
    ).toHaveProperty("commitAuthor", author);
    expect(
      parseGitHubIntegrationConfiguration({
        ...configuration,
        commitAuthor: input,
      }),
    ).toHaveProperty("commitAuthor", author);
    expect(input.name).toBe(`  ${author.name}  `);
  });

  it("принимает имя длиной 160 и email длиной 254 символа", () => {
    const maximum = {
      name: "Я".repeat(160),
      email: `${"a".repeat(64)}@${"a".repeat(63)}.${"b".repeat(63)}.${"c".repeat(61)}`,
    };
    expect(maximum.email).toHaveLength(254);
    expect(parseGitCommitAuthor(maximum)).toStrictEqual(maximum);
  });

  it("сохраняет различие между отсутствием настройки и явным удалением", () => {
    expect(parseSaveGitHubIntegrationInput(saveInput)).not.toHaveProperty(
      "commitAuthor",
    );
    expect(
      parseSaveGitHubIntegrationInput({ ...saveInput, commitAuthor: null }),
    ).toHaveProperty("commitAuthor", null);
    expect(parseGitHubIntegrationConfiguration(configuration)).toStrictEqual({
      ...configuration,
      transport: "https",
    });
  });

  it.each([
    null,
    [],
    "developer@example.com",
    {},
    { name: author.name },
    { email: author.email },
    { ...author, token: "extra-field" },
    { ...author, name: "" },
    { ...author, name: "   " },
    { ...author, name: 123 },
    { ...author, name: "a".repeat(161) },
    { ...author, email: "" },
    { ...author, email: "   " },
    { ...author, email: 123 },
    { ...author, email: "without-domain" },
    { ...author, email: "a@@example.com" },
    { ...author, email: ".a@example.com" },
    { ...author, email: "a..b@example.com" },
    { ...author, email: "a@-example.com" },
    { ...author, email: "a@example..com" },
    { ...author, email: "a@example.com." },
    { ...author, email: "a b@example.com" },
    {
      ...author,
      email: `${"a".repeat(64)}@${"a".repeat(63)}.${"b".repeat(63)}.${"c".repeat(62)}`,
    },
  ])("отклоняет неправильную пару #%# во всех читающих контрактах", (input) => {
    expect(() => parseGitCommitAuthor(input)).toThrow(ContractValidationError);
    expect(() =>
      parseGitHubIntegrationConfiguration({
        ...configuration,
        commitAuthor: input,
      }),
    ).toThrow(ContractValidationError);
    if (input !== null) {
      expect(() =>
        parseSaveGitHubIntegrationInput({ ...saveInput, commitAuthor: input }),
      ).toThrow(ContractValidationError);
    }
  });

  it.each([
    "\0",
    "\n",
    "\r",
    "\t",
    "\u007f",
    "\u0085",
    "\u2028",
    "\u2029",
    "<",
    ">",
  ])(
    "запрещает управляющий символ или разделитель #%# до trim",
    (character) => {
      expect(() =>
        parseGitCommitAuthor({ ...author, name: `${author.name}${character}` }),
      ).toThrow(ContractValidationError);
      expect(() =>
        parseGitCommitAuthor({
          ...author,
          email: `${author.email}${character}`,
        }),
      ).toThrow(ContractValidationError);
    },
  );
});

describe("Git commit author runtime", () => {
  it.each([null, "unreadable encrypted fixture"])(
    "получает автора без vault и без расшифровки credential #%#",
    async (credential) => {
      const reader = {
        readPrimaryGitHub: vi
          .fn()
          .mockResolvedValue({ ...row(), credential_envelope: credential }),
      };
      const service = new GitCommitAuthorService(reader);
      await expect(
        service.resolvePrimaryGitCommitAuthor(),
      ).resolves.toStrictEqual({
        state: "ready",
        author,
        connectionKey: "github:primary",
        revision: 3,
      });
      expect(reader.readPrimaryGitHub).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    { integration: undefined, state: "absent" },
    { integration: { ...row(null), enabled: false }, state: "disabled" },
    { integration: { ...row(), configuration }, state: "unconfigured" },
  ])(
    "возвращает $state для отсутствующей, выключенной или старой записи",
    async ({ integration, state }) => {
      const service = new GitCommitAuthorService({
        readPrimaryGitHub: vi.fn().mockResolvedValue(integration),
      });
      await expect(
        service.resolvePrimaryGitCommitAuthor(),
      ).resolves.toStrictEqual({ state });
    },
  );

  it("при каждом вызове читает новую ревизию и актуального автора", async () => {
    const updatedAuthor = { ...author, name: "Второй разработчик" };
    const readPrimaryGitHub = vi
      .fn()
      .mockResolvedValueOnce(row())
      .mockResolvedValueOnce({ ...row(updatedAuthor), revision: "4" })
      .mockResolvedValueOnce({ ...row(), configuration, revision: 5 });
    const service = new GitCommitAuthorService({ readPrimaryGitHub });
    await expect(
      service.resolvePrimaryGitCommitAuthor(),
    ).resolves.toMatchObject({ author, revision: 3 });
    await expect(
      service.resolvePrimaryGitCommitAuthor(),
    ).resolves.toMatchObject({ author: updatedAuthor, revision: 4 });
    await expect(
      service.resolvePrimaryGitCommitAuthor(),
    ).resolves.toStrictEqual({ state: "unconfigured" });
    expect(readPrimaryGitHub).toHaveBeenCalledTimes(3);
  });

  it.each([
    row(null),
    row({
      name: "invalid-author-private-fixture",
      email: "invalid-email-private-fixture",
    }),
    { ...row(), connection_key: "github:other" },
    { ...row(), revision: 0 },
  ])(
    "закрывает чтение повреждённой настройки #%# без её выдачи в ошибке",
    async (integration) => {
      const service = new GitCommitAuthorService({
        readPrimaryGitHub: vi.fn().mockResolvedValue(integration),
      });
      const error = await service
        .resolvePrimaryGitCommitAuthor()
        .catch((failure: unknown) => failure);
      expect(error).toBeInstanceOf(IntegrationRuntimeError);
      expect(error).not.toHaveProperty("cause");
      expect(String(error)).not.toContain("private-fixture");
    },
  );

  it("возвращает безопасную ошибку при недоступности repository", async () => {
    const query = vi
      .fn()
      .mockRejectedValue(new Error("private-database-fixture"));
    const service = new GitCommitAuthorService(
      new IntegrationRuntimeRepository({ query }),
    );
    const error = await service
      .resolvePrimaryGitCommitAuthor()
      .catch((failure: unknown) => failure);
    expect(error).toHaveProperty(
      "message",
      "Integration registry is unavailable.",
    );
    expect(error).not.toHaveProperty("cause");
    expect(String(error)).not.toContain("private-database-fixture");
  });
});
