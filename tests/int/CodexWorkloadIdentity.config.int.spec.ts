/**
 * @file tests/int/CodexWorkloadIdentity.config.int.spec.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Проверяет готовность серверного файла workload identity, права доступа и безопасные ошибки конфигурации.
 */

// @vitest-environment node

import {
  chmod,
  link,
  lstat,
  mkdir,
  mkdtemp,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readCodexWorkloadIdentityConfiguration } from "@realize/codex-adapter/profile";

const DIRECTORIES: string[] = [];
const ERROR_MESSAGE =
  "Серверная конфигурация workload identity для Codex недействительна или недоступна.";

const createFixture = async () => {
  const protectedDirectory = await mkdtemp(
    join(tmpdir(), "realize-workload-identity-test-"),
  );
  DIRECTORIES.push(protectedDirectory);
  await chmod(protectedDirectory, 0o700);
  const identityTokenFile = join(protectedDirectory, "identity-token");
  // Фиктивные байты не являются credential; формат токена проверяет поставщик.
  await writeFile(identityTokenFile, Buffer.from([0xff, 0xfe]), {
    mode: 0o600,
  });
  return {
    protectedDirectory,
    identityTokenFile,
    environment: {
      REALIZE_CODEX_FEDERATION_RULE_ID: "fixture-rule_123",
      REALIZE_CODEX_IDENTITY_TOKEN_FILE: identityTokenFile,
    },
  };
};

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await Promise.all(
    DIRECTORIES.splice(0).map((path) =>
      rm(path, { recursive: true, force: true }),
    ),
  );
});

describe("readCodexWorkloadIdentityConfiguration", () => {
  it.each([0o400, 0o600])(
    "принимает защищённый файл с правами %i без разбора токена",
    async (mode) => {
      const fixture = await createFixture();
      await chmod(fixture.identityTokenFile, mode);
      const environment = Object.freeze({ ...fixture.environment });

      await expect(
        readCodexWorkloadIdentityConfiguration(environment),
      ).resolves.toEqual({
        federationRuleID: fixture.environment.REALIZE_CODEX_FEDERATION_RULE_ID,
        identityTokenFile: fixture.identityTokenFile,
        protectedDirectory: fixture.protectedDirectory,
      });
      expect((await lstat(fixture.identityTokenFile)).mode & 0o7777).toBe(mode);
    },
  );

  it("читает серверное окружение по умолчанию", async () => {
    const fixture = await createFixture();
    for (const [name, value] of Object.entries(fixture.environment))
      vi.stubEnv(name, value);

    await expect(
      readCodexWorkloadIdentityConfiguration(),
    ).resolves.toMatchObject({
      identityTokenFile: fixture.identityTokenFile,
    });
  });

  it.each([
    {},
    { REALIZE_CODEX_FEDERATION_RULE_ID: "fixture-rule" },
    { REALIZE_CODEX_IDENTITY_TOKEN_FILE: "/fixture-unavailable" },
    {
      REALIZE_CODEX_FEDERATION_RULE_ID: "",
      REALIZE_CODEX_IDENTITY_TOKEN_FILE: "",
    },
  ])(
    "отказывает отсутствующей или неполной конфигурации",
    async (environment) => {
      await expect(
        readCodexWorkloadIdentityConfiguration(environment),
      ).rejects.toThrow(ERROR_MESSAGE);
    },
  );

  it.each([" ", "rule.with.dot", "rule/segment", "rule\n", "x".repeat(257)])(
    "отказывает недопустимому federation rule ID",
    async (federationRuleID) => {
      const fixture = await createFixture();
      await expect(
        readCodexWorkloadIdentityConfiguration({
          ...fixture.environment,
          REALIZE_CODEX_FEDERATION_RULE_ID: federationRuleID,
        }),
      ).rejects.toThrow(ERROR_MESSAGE);
    },
  );

  it.each(["identity-token", "/fixture/../identity-token", "/fixture\0token"])(
    "отказывает относительному или ненормализованному пути",
    async (identityTokenFile) => {
      const fixture = await createFixture();
      await expect(
        readCodexWorkloadIdentityConfiguration({
          ...fixture.environment,
          REALIZE_CODEX_IDENTITY_TOKEN_FILE: identityTokenFile,
        }),
      ).rejects.toThrow(ERROR_MESSAGE);
    },
  );

  it("отказывает файлу внутри рабочего checkout", async () => {
    const fixture = await createFixture();
    vi.spyOn(process, "cwd").mockReturnValue(fixture.protectedDirectory);
    await expect(
      readCodexWorkloadIdentityConfiguration(fixture.environment),
    ).rejects.toThrow(ERROR_MESSAGE);
  });

  it("отказывает токену внутри REALIZE_AI_WORKSPACE_ROOT при запуске из другого cwd", async () => {
    const fixture = await createFixture();
    await expect(
      readCodexWorkloadIdentityConfiguration({
        ...fixture.environment,
        REALIZE_AI_WORKSPACE_ROOT: fixture.protectedDirectory,
      }),
    ).rejects.toThrow(ERROR_MESSAGE);
    const unrelated = await createFixture();
    await expect(
      readCodexWorkloadIdentityConfiguration({
        ...fixture.environment,
        REALIZE_AI_WORKSPACE_ROOT: unrelated.protectedDirectory,
      }),
    ).resolves.toMatchObject({ identityTokenFile: fixture.identityTokenFile });
  });

  it.each([0o644, 0o660, 0o700, 0o4600])(
    "отказывает небезопасным правам файла %i без chmod",
    async (mode) => {
      const fixture = await createFixture();
      await chmod(fixture.identityTokenFile, mode);
      await expect(
        readCodexWorkloadIdentityConfiguration(fixture.environment),
      ).rejects.toThrow(ERROR_MESSAGE);
      expect((await lstat(fixture.identityTokenFile)).mode & 0o7777).toBe(mode);
    },
  );

  it.each([0o750, 0o770, 0o1700])(
    "отказывает небезопасным правам каталога %i без chmod",
    async (mode) => {
      const fixture = await createFixture();
      await chmod(fixture.protectedDirectory, mode);
      await expect(
        readCodexWorkloadIdentityConfiguration(fixture.environment),
      ).rejects.toThrow(ERROR_MESSAGE);
      expect((await lstat(fixture.protectedDirectory)).mode & 0o7777).toBe(
        mode,
      );
    },
  );

  it("отказывает symbolic link файла и каталога", async () => {
    const fixture = await createFixture();
    const outside = await createFixture();
    await rm(fixture.identityTokenFile);
    await symlink(outside.identityTokenFile, fixture.identityTokenFile);
    await expect(
      readCodexWorkloadIdentityConfiguration(fixture.environment),
    ).rejects.toThrow(ERROR_MESSAGE);

    const directoryAlias = join(fixture.protectedDirectory, "linked-directory");
    await symlink(outside.protectedDirectory, directoryAlias);
    await expect(
      readCodexWorkloadIdentityConfiguration({
        ...fixture.environment,
        REALIZE_CODEX_IDENTITY_TOKEN_FILE: join(
          directoryAlias,
          "identity-token",
        ),
      }),
    ).rejects.toThrow(ERROR_MESSAGE);
  });

  it("отказывает hard link и каталогу вместо файла", async () => {
    const fixture = await createFixture();
    await link(
      fixture.identityTokenFile,
      join(fixture.protectedDirectory, "hard-link"),
    );
    await expect(
      readCodexWorkloadIdentityConfiguration(fixture.environment),
    ).rejects.toThrow(ERROR_MESSAGE);

    await rm(fixture.identityTokenFile);
    await mkdir(fixture.identityTokenFile, { mode: 0o700 });
    await expect(
      readCodexWorkloadIdentityConfiguration(fixture.environment),
    ).rejects.toThrow(ERROR_MESSAGE);
  });

  it("отказывает symlink среди предков защищённого каталога", async () => {
    const fixture = await createFixture();
    const outside = await createFixture();
    const nestedDirectory = join(outside.protectedDirectory, "nested");
    await mkdir(nestedDirectory, { mode: 0o700 });
    await writeFile(join(nestedDirectory, "identity-token"), "fixture", {
      mode: 0o600,
    });
    const ancestorAlias = join(fixture.protectedDirectory, "ancestor");
    await symlink(outside.protectedDirectory, ancestorAlias);
    await expect(
      readCodexWorkloadIdentityConfiguration({
        ...fixture.environment,
        REALIZE_CODEX_IDENTITY_TOKEN_FILE: join(
          ancestorAlias,
          "nested",
          "identity-token",
        ),
      }),
    ).rejects.toThrow(ERROR_MESSAGE);
  });

  it.each([1, 65_536])("принимает допустимый размер файла %i", async (size) => {
    const fixture = await createFixture();
    await writeFile(fixture.identityTokenFile, Buffer.alloc(size));
    await expect(
      readCodexWorkloadIdentityConfiguration(fixture.environment),
    ).resolves.toMatchObject({ identityTokenFile: fixture.identityTokenFile });
  });

  it.each([0, 65_537])("отказывает размеру файла %i", async (size) => {
    const fixture = await createFixture();
    await writeFile(fixture.identityTokenFile, Buffer.alloc(size));
    await expect(
      readCodexWorkloadIdentityConfiguration(fixture.environment),
    ).rejects.toThrow(ERROR_MESSAGE);
  });

  it("проверяет владельца файла и каталога по текущему UID", async () => {
    const fixture = await createFixture();
    const actualUID = process.getuid!();
    vi.spyOn(process, "getuid").mockReturnValue(actualUID + 1);
    await expect(
      readCodexWorkloadIdentityConfiguration(fixture.environment),
    ).rejects.toThrow(ERROR_MESSAGE);
  });

  it("не передаёт системный путь и cause в ошибке отсутствующего файла", async () => {
    const fixture = await createFixture();
    await rm(fixture.identityTokenFile);
    const error = await readCodexWorkloadIdentityConfiguration(
      fixture.environment,
    ).catch((failure: unknown) => failure);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe(ERROR_MESSAGE);
    expect((error as Error).cause).toBeUndefined();
    expect(String(error)).not.toContain(fixture.protectedDirectory);
  });
});
