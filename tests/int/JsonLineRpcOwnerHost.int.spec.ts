/**
 * @file tests/int/JsonLineRpcOwnerHost.int.spec.ts
 * @version 1.0.1
 * @date 2026-10-23
 * @description Проверяет окружение owner shell, закрытый RPC и завершение всей native process group без модели.
 */

// @vitest-environment node

import { EventEmitter } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JsonLineRPCClient } from "../../packages/codex-adapter/src/JsonLineRpcClient.adapter";
import type { JsonLineRPCClientOptions } from "../../packages/codex-adapter/src/JsonLineRpcClient.types";

const mocked = vi.hoisted(() => ({ spawn: vi.fn(), userInfo: vi.fn() }));
vi.mock("node:child_process", () => ({ spawn: mocked.spawn }));
vi.mock("node:os", async (original) => ({
  ...(await original<typeof import("node:os")>()),
  userInfo: mocked.userInfo,
}));

let root: string;
let options: JsonLineRPCClientOptions;
const childProcess = () => {
  const child = Object.assign(new EventEmitter(), {
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
  });
  mocked.spawn.mockReturnValue(child);
  return child;
};
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "realize-owner-transport-"));
  vi.spyOn(process, "geteuid").mockReturnValue(1000);
  mocked.spawn.mockReset();
  mocked.userInfo.mockReset().mockReturnValue({
    uid: 1000,
    username: "fixture-owner",
    homedir: "/home/fixture-owner",
    shell: "/bin/bash",
  });
  options = {
    workingDirectory: root,
    ownerHost: { workspaceRoot: root, osUser: "fixture-owner" },
    environment: {
      NODE_ENV: "test",
      CODEX_HOME: "/fixture-integration",
      CODEX_ACCESS_TOKEN: "synthetic-private-token",
      PATH: "/unsafe-bin:.",
      REALIZE_SECRET: "synthetic-private-secret",
    },
  };
});
afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  await rm(root, { recursive: true, force: true });
});

describe("owner-host transport", () => {
  it("оставляет credentials только App Server и задаёт shell allowlist с закреплённым Node/npm", async () => {
    const child = childProcess();
    const client = new JsonLineRPCClient(options);
    client.start();
    const [, args, settings] = mocked.spawn.mock.calls[0] as [
      string,
      string[],
      Record<string, unknown>,
    ];
    expect(settings).toMatchObject({
      cwd: root,
      env: options.environment,
      shell: false,
      detached: process.platform !== "win32",
    });
    expect(args).toContain("mcp_servers={}");
    expect(args).toContain("features.apps=false");
    expect(args).toContain("features.plugins=false");
    expect(args).toContain("features.skill_mcp_dependency_install=false");
    expect(args).toContain("allow_login_shell=false");
    expect(args).toContain("agents.enabled=false");
    expect(args).not.toContain("project_doc_max_bytes=0");
    expect(args).toContain(
      `projects={${JSON.stringify(root)}={trust_level="trusted"}}`,
    );
    const policy = args.find((arg) =>
      arg.startsWith("shell_environment_policy={"),
    );
    expect(policy).toContain('inherit="none"');
    expect(policy).toContain('HOME="/home/fixture-owner"');
    expect(policy).toContain('USER="fixture-owner"');
    expect(policy).toContain(
      `PATH=${JSON.stringify([...new Set([dirname(process.execPath), "/home/fixture-owner/.local/bin", "/usr/local/bin", "/usr/bin", "/bin"])].join(":"))}`,
    );
    expect(policy).toContain('REALIZE_GIT_CODEX_HOME="/fixture-integration"');
    expect(args.join(" ")).not.toMatch(
      /synthetic-private|unsafe-bin|REALIZE_SECRET|CODEX_ACCESS_TOKEN/,
    );
    const closed = client.close();
    child.emit("close");
    await closed;
  });

  it.each(["args", "bridge", "dynamic-tools", "ignore-instructions"])(
    "не допускает несовместимый %s",
    (kind) => {
      if (kind === "args") options.args = ["app-server"];
      if (kind === "bridge")
        options.repositoryMcpURL = "http://127.0.0.1:43111/mcp";
      if (kind === "dynamic-tools") options.onRequest = vi.fn();
      if (kind === "ignore-instructions")
        options.ignoreProjectInstructions = true;
      expect(() => new JsonLineRPCClient(options)).toThrow(
        "codex_configuration_invalid",
      );
      expect(mocked.spawn).not.toHaveBeenCalled();
    },
  );

  it.each([
    "item/commandExecution/requestApproval",
    "item/tool/requestUserInput",
    "item/tool/call",
  ])("отклоняет %s даже при owner-host", async (method) => {
    const child = childProcess();
    const client = new JsonLineRPCClient(options);
    const response: string[] = [];
    child.stdin.on("data", (data) => response.push(String(data)));
    client.start();
    const pending = client.getNotifications()[Symbol.asyncIterator]().next();
    child.stdout.write(`${JSON.stringify({ id: 4, method, params: {} })}\n`);
    expect((await pending).value).toEqual({
      method: "realize/securityViolation",
    });
    expect(JSON.parse(response[0]).error.message).toBe(
      "codex_request_forbidden",
    );
    const closed = client.close();
    child.emit("close");
    await closed;
  });

  it("abort завершает native process group и дожидается SIGKILL потомков после exit лидера", async () => {
    vi.useFakeTimers();
    const child = Object.assign(childProcess(), { pid: 812345 });
    const kill = vi.spyOn(process, "kill").mockReturnValue(true);
    const controller = new AbortController();
    const client = new JsonLineRPCClient({
      ...options,
      signal: controller.signal,
    });
    client.start();
    controller.abort();
    expect(kill).toHaveBeenCalledWith(-812345, "SIGTERM");
    child.emit("exit");
    child.emit("close");
    let finished = false;
    const closed = client.close().then(() => {
      finished = true;
    });
    await Promise.resolve();
    expect(finished).toBe(false);
    await vi.advanceTimersByTimeAsync(1000);
    await closed;
    expect(kill).toHaveBeenCalledWith(-812345, "SIGKILL");
    expect(finished).toBe(true);
  });
});
