/**
 * @file tests/int/CodexProfile.adapter.int.spec.ts
 * @version 1.1.0
 * @date 2026-09-09
 * @description Проверяет native auth validation и защиту профиля Codex от symlink и наследования credentials.
 */

// @vitest-environment node

import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  prepareCodexProfile,
  readCodexProfileAuth,
  removeCodexProfileAuth,
  validateNativeCodexAuth,
  validateCodexCredential,
  createCodexAccessTokenCredential,
} from "@realize/codex-adapter/profile";

const directories: string[] = [];
const directory = async () => {
  const home = await mkdtemp(join(tmpdir(), "realize-codex-profile-test-"));
  directories.push(home);
  return home;
};
const apiJSON = JSON.stringify({
  OPENAI_API_KEY: "fixture-selected-api-key",
  auth_mode: "apikey",
});
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("CodexProfile", () => {
  it("сохраняет native auth и удаляет stale credential перед новым login", async () => {
    const home = await directory();
    const source = {
      NODE_ENV: "test" as const,
      OPENAI_API_KEY: "fixture-global-key",
      CODEX_HOME: "/fixture-global-profile",
      HOME: "/fixture-home",
      CODEX_API_KEY: "fixture-unselected-api",
      CODEX_ACCESS_TOKEN: "fixture-unselected-access",
      OPENAI_FEDERATION_RULE_ID: "fixture-unselected-rule",
      OPENAI_IDENTITY_TOKEN_FILE: "/fixture-unselected-token",
      OPENAI_WORKLOAD_IDENTITY_CONTEXT: '{"instance_id":"fixture"}',
    };
    const environment = await prepareCodexProfile({
      home,
      authMode: "apiKey",
      authJSON: apiJSON,
      sourceEnvironment: source,
    });
    expect(await readCodexProfileAuth(home)).toBe(apiJSON);
    expect(environment.CODEX_HOME).toBe(home);
    expect(environment.OPENAI_API_KEY).toBeUndefined();
    for (const name of [
      "CODEX_API_KEY",
      "CODEX_ACCESS_TOKEN",
      "OPENAI_FEDERATION_RULE_ID",
      "OPENAI_IDENTITY_TOKEN_FILE",
      "OPENAI_WORKLOAD_IDENTITY_CONTEXT",
    ])
      expect(environment[name]).toBeUndefined();
    expect(source.OPENAI_API_KEY).toBe("fixture-global-key");
    await prepareCodexProfile({
      home,
      authMode: "chatgpt",
      sourceEnvironment: source,
    });
    await expect(readCodexProfileAuth(home)).rejects.toThrow(
      "недействителен или недоступен",
    );
    await removeCodexProfileAuth(home);
  });

  it("передаёт PAT только в scoped environment и не создаёт native auth.json", async () => {
    const home = await directory();
    const authJSON = createCodexAccessTokenCredential(
      "fixture-workspace-access-token",
    );
    await prepareCodexProfile({ home, authMode: "apiKey", authJSON: apiJSON });
    const environment = await prepareCodexProfile({
      home,
      authMode: "accessToken",
      authJSON,
    });
    expect(environment.CODEX_ACCESS_TOKEN).toBe(
      "fixture-workspace-access-token",
    );
    await expect(readCodexProfileAuth(home)).rejects.toThrow();
    expect(await readFile(join(home, "config.toml"), "utf8")).toContain(
      'forced_login_method = "chatgpt"',
    );
    expect(validateCodexCredential(authJSON, "accessToken")).toBe(authJSON);
    expect(() => validateNativeCodexAuth(authJSON, "accessToken")).toThrow();
    expect(() => validateCodexCredential(apiJSON, "accessToken")).toThrow();
    expect(() =>
      validateCodexCredential(authJSON, "workloadIdentity"),
    ).toThrow();
    await expect(
      prepareCodexProfile({ home, authMode: "accessToken" }),
    ).rejects.toThrow();
  });

  it.each(["", "fixture token", "fixture\n", "x".repeat(32_769)])(
    "отвергает недопустимый PAT без echo",
    (token) => {
      expect(() => createCodexAccessTokenCredential(token)).toThrow(
        "Профиль авторизации Codex недействителен",
      );
    },
  );

  it("не следует symlink каталога или auth.json и не перезаписывает внешний файл", async () => {
    const home = await directory();
    const outside = await directory();
    const external = join(outside, "fixture");
    await writeFile(external, "fixture-preserved");
    await symlink(external, join(home, "auth.json"));
    await expect(
      prepareCodexProfile({ home, authMode: "apiKey", authJSON: apiJSON }),
    ).rejects.toThrow("недействителен или недоступен");
    await expect(readCodexProfileAuth(home)).rejects.toThrow(
      "недействителен или недоступен",
    );
    expect(await readFile(external, "utf8")).toBe("fixture-preserved");
    const alias = join(home, "linked-home");
    await symlink(outside, alias);
    await expect(
      prepareCodexProfile({
        home: alias,
        authMode: "apiKey",
        authJSON: apiJSON,
      }),
    ).rejects.toThrow("недействителен или недоступен");
  });

  it.each([
    "null",
    "[]",
    "invalid fixture",
    JSON.stringify({ OPENAI_API_KEY: "fixture-key", tokens: {} }),
    JSON.stringify({ tokens: { access_token: "fixture" } }),
    "x".repeat(65_537),
  ])("отказывает недопустимому native auth без raw error", (source) => {
    expect(() => validateNativeCodexAuth(source, "apiKey")).toThrow(
      "Профиль авторизации Codex недействителен или недоступен.",
    );
  });

  it("принимает legacy native OAuth без auth_mode и без account_id", () => {
    const source = JSON.stringify({
      OPENAI_API_KEY: null,
      tokens: {
        id_token: "fixture-id",
        access_token: "fixture-access",
        refresh_token: "fixture-refresh",
      },
    });
    expect(validateNativeCodexAuth(source, "chatgpt")).toBe(source);
    expect(() => validateNativeCodexAuth(source, "apiKey")).toThrow();
    expect(() => validateNativeCodexAuth(apiJSON, "chatgpt")).toThrow();
  });

  it("ограничивает чтение auth.json и отвергает invalid UTF-8", async () => {
    const home = await directory();
    await writeFile(join(home, "auth.json"), "x".repeat(65_537));
    await expect(readCodexProfileAuth(home)).rejects.toThrow(
      "недействителен или недоступен",
    );
    await writeFile(join(home, "auth.json"), Buffer.from([0xff, 0xfe]));
    await expect(readCodexProfileAuth(home)).rejects.toThrow(
      "недействителен или недоступен",
    );
  });
});
