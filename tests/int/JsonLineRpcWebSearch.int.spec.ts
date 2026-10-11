/**
 * @file tests/int/JsonLineRpcWebSearch.int.spec.ts
 * @version 1.1.0
 * @date 2026-10-04
 * @description Проверяет web_search и доверенный Linux tool PATH без наследования окружения shell.
 */

// @vitest-environment node

import { EventEmitter } from "node:events";
import { dirname } from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JsonLineRPCClient } from "../../packages/codex-adapter/src/JsonLineRpcClient.adapter";
import type { JsonLineRPCClientOptions } from "../../packages/codex-adapter/src/JsonLineRpcClient.types";

const processMock = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock("node:child_process", () => ({ spawn: processMock.spawn }));

beforeEach(() => processMock.spawn.mockReset());
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("RPC web-search arguments", () => {
  it("disables worktree instructions and project config only for product runtime", async () => {
    const child = Object.assign(new EventEmitter(), {
      stdin: new PassThrough(),
      stdout: new PassThrough(),
      stderr: new PassThrough(),
    });
    processMock.spawn.mockReturnValue(child);
    const client = new JsonLineRPCClient({
      workingDirectory: "/fixture-customer",
      environment: { NODE_ENV: "test", CODEX_HOME: "/fixture-profile" },
      ignoreProjectInstructions: true,
    });
    client.start();
    const args = processMock.spawn.mock.calls[0][1] as string[];
    expect(args).toContain("project_doc_max_bytes=0");
    expect(args).toContain(
      'projects={"/fixture-customer"={trust_level="untrusted"}}',
    );
    const closed = client.close();
    child.emit("close");
    await closed;
  });
  it.each([undefined, "disabled", "live"] as const)(
    "использует %s с strict config, пустым MCP и безопасным окружением shell",
    async (webSearch) => {
      const child = Object.assign(new EventEmitter(), {
        stdin: new PassThrough(),
        stdout: new PassThrough(),
        stderr: new PassThrough(),
      });
      processMock.spawn.mockReturnValue(child);
      const client = new JsonLineRPCClient({
        workingDirectory: "/fixture-snapshot",
        environment: { NODE_ENV: "test", CODEX_HOME: "/fixture-profile" },
        webSearch,
      });
      client.start();
      expect(processMock.spawn).toHaveBeenCalledWith(
        "codex",
        [
          "app-server",
          "--stdio",
          "--strict-config",
          "-c",
          "mcp_servers={}",
          "-c",
          "notify=[]",
          "-c",
          `web_search="${webSearch ?? "disabled"}"`,
          "-c",
          'shell_environment_policy.inherit="none"',
          ...(process.platform === "linux"
            ? [
                "-c",
                `shell_environment_policy.set.PATH=${JSON.stringify(
                  [
                    ...new Set([dirname(process.execPath), "/usr/bin", "/bin"]),
                  ].join(":"),
                )}`,
              ]
            : []),
        ],
        expect.objectContaining({ shell: false, cwd: "/fixture-snapshot" }),
      );
      const closed = client.close();
      child.emit("close");
      await closed;
    },
  );

  it.each([
    ["/usr/bin/node", "/usr/bin:/bin"],
    [
      '/fixture/runtime "quoted"/$(literal)/bin/node',
      '/fixture/runtime "quoted"/$(literal)/bin:/usr/bin:/bin',
    ],
  ])(
    "Linux PATH берёт только runtime %s, без ambient PATH и секретов",
    async (execPath, toolPath) => {
      vi.stubEnv("PATH", "/fixture-host-bin:.");
      vi.stubEnv("REALIZE_FIXTURE_SECRET", "synthetic-host-value");
      vi.stubGlobal("process", { ...process, platform: "linux", execPath });
      const child = Object.assign(new EventEmitter(), {
        stdin: new PassThrough(),
        stdout: new PassThrough(),
        stderr: new PassThrough(),
      });
      processMock.spawn.mockReturnValue(child);
      const environment: NodeJS.ProcessEnv = {
        NODE_ENV: "test",
        CODEX_HOME: "/fixture-profile",
        PATH: "/fixture-caller-bin:/fixture-workspace",
        CODEX_ACCESS_TOKEN: "synthetic-selected-credential",
      };
      const client = new JsonLineRPCClient({
        workingDirectory: "/fixture-workspace",
        environment,
      });
      client.start();
      const [binary, args, options] = processMock.spawn.mock.calls[0];
      expect(binary).toBe("codex");
      expect(args).toContain('shell_environment_policy.inherit="none"');
      const settings = (args as string[]).filter((value) =>
        value.startsWith("shell_environment_policy.set."),
      );
      expect(settings).toEqual([
        `shell_environment_policy.set.PATH=${JSON.stringify(toolPath)}`,
      ]);
      expect(JSON.parse(settings[0].slice(settings[0].indexOf("=") + 1))).toBe(
        toolPath,
      );
      expect(JSON.stringify(args)).not.toMatch(
        /fixture-host-bin|fixture-caller-bin|fixture-workspace|synthetic-host-value|synthetic-selected-credential/,
      );
      expect(options).toMatchObject({ env: environment, shell: false });
      expect(options.env.REALIZE_FIXTURE_SECRET).toBeUndefined();
      const closed = client.close();
      child.emit("close");
      await closed;
    },
  );

  it("не меняет shell PATH на других платформах", async () => {
    vi.stubGlobal("process", { ...process, platform: "darwin" });
    const child = Object.assign(new EventEmitter(), {
      stdin: new PassThrough(),
      stdout: new PassThrough(),
      stderr: new PassThrough(),
    });
    processMock.spawn.mockReturnValue(child);
    const client = new JsonLineRPCClient({
      workingDirectory: "/fixture-workspace",
      environment: { NODE_ENV: "test", CODEX_HOME: "/fixture-profile" },
    });
    client.start();
    const args: string[] = processMock.spawn.mock.calls[0][1];
    expect(args).toContain('shell_environment_policy.inherit="none"');
    expect(
      args.some((argument) =>
        argument.startsWith("shell_environment_policy.set."),
      ),
    ).toBe(false);
    const closed = client.close();
    child.emit("close");
    await closed;
  });

  it("сохраняет полный явный override аргументов доверенного клиента", async () => {
    const child = Object.assign(new EventEmitter(), {
      stdin: new PassThrough(),
      stdout: new PassThrough(),
      stderr: new PassThrough(),
    });
    processMock.spawn.mockReturnValue(child);
    const args = ["app-server", "--stdio"];
    const client = new JsonLineRPCClient({
      workingDirectory: "/fixture-workspace",
      environment: { NODE_ENV: "test", CODEX_HOME: "/fixture-profile" },
      args,
    });
    client.start();
    expect(processMock.spawn.mock.calls[0][1]).toEqual(args);
    const closed = client.close();
    child.emit("close");
    await closed;
  });

  it("отклоняет неразрешённый runtime override без запуска процесса", () => {
    expect(
      () =>
        new JsonLineRPCClient({
          workingDirectory: "/fixture",
          environment: { NODE_ENV: "test", CODEX_HOME: "/fixture-profile" },
          webSearch: 'live"; unsafe' as JsonLineRPCClientOptions["webSearch"],
        }),
    ).toThrow("codex_configuration_invalid");
    expect(processMock.spawn).not.toHaveBeenCalled();
  });
});
