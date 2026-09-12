/**
 * @file tests/int/CodexEnvironment.int.spec.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Проверяет отказ от неявной авторизации хоста до запуска процесса Codex.
 */

// @vitest-environment node

import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCodexEnvironment } from "../../packages/codex-adapter/src/environment";
import { JsonLineRPCClient } from "../../packages/codex-adapter/src/JsonLineRpcClient.adapter";

const processMock = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock("node:child_process", () => ({ spawn: processMock.spawn }));

beforeEach(() => processMock.spawn.mockReset());
afterEach(() => vi.unstubAllEnvs());

describe("Явная авторизация процесса Codex", () => {
  it("копирует инфраструктурное окружение без ключей и личного профиля хоста", () => {
    const source: NodeJS.ProcessEnv = {
      NODE_ENV: "test",
      PATH: "/fixture-bin",
      HOME: "/fixture-host-home",
      HTTPS_PROXY: "http://fixture-proxy.test",
      CODEX_HOME: "/fixture-personal-codex",
      OPENAI_API_KEY: "fixture-host-api",
      CODEX_API_KEY: "fixture-host-codex-api",
      CODEX_ACCESS_TOKEN: "fixture-host-access",
      OPENAI_FEDERATION_RULE_ID: "fixture-host-rule",
      OPENAI_IDENTITY_TOKEN_FILE: "/fixture-host-identity",
    };
    expect(createCodexEnvironment(source)).toEqual({
      NODE_ENV: "test",
      PATH: "/fixture-bin",
      HOME: "/fixture-host-home",
      HTTPS_PROXY: "http://fixture-proxy.test",
    });
    expect(source.CODEX_HOME).toBe("/fixture-personal-codex");
    expect(source.OPENAI_API_KEY).toBe("fixture-host-api");
  });

  it.each([
    undefined,
    null,
    {},
    { NODE_ENV: "test" },
    { CODEX_HOME: "" },
    { CODEX_HOME: "relative-profile" },
    { CODEX_HOME: "/fixture\0profile" },
  ])("не запускает процесс без абсолютного профиля: %j", (environment) => {
    vi.stubEnv("CODEX_HOME", "/fixture-host-codex");
    vi.stubEnv("OPENAI_API_KEY", "fixture-host-api");
    expect(
      () =>
        new JsonLineRPCClient({
          workingDirectory: "/fixture-snapshot",
          environment: environment as NodeJS.ProcessEnv,
        }),
    ).toThrow("codex_configuration_invalid");
    expect(processMock.spawn).not.toHaveBeenCalled();
  });

  it("передаёт только выбранное окружение без дополнения ambient credential", async () => {
    vi.stubEnv("CODEX_HOME", "/fixture-host-codex");
    vi.stubEnv("OPENAI_API_KEY", "fixture-host-api");
    const child = Object.assign(new EventEmitter(), {
      stdin: new PassThrough(),
      stdout: new PassThrough(),
      stderr: new PassThrough(),
    });
    processMock.spawn.mockReturnValue(child);
    const environment: NodeJS.ProcessEnv = {
      NODE_ENV: "test",
      CODEX_HOME: "/fixture-integration-profile",
      CODEX_ACCESS_TOKEN: "fixture-selected-access",
    };
    const client = new JsonLineRPCClient({
      workingDirectory: "/fixture-snapshot",
      environment,
    });
    client.start();
    expect(processMock.spawn).toHaveBeenCalledWith(
      "codex",
      expect.any(Array),
      expect.objectContaining({ env: environment, shell: false }),
    );
    expect(
      processMock.spawn.mock.calls[0][2].env.OPENAI_API_KEY,
    ).toBeUndefined();
    const closed = client.close();
    child.emit("close");
    await closed;
  });
});
