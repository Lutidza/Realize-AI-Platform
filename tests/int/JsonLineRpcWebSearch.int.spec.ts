/**
 * @file tests/int/JsonLineRpcWebSearch.int.spec.ts
 * @version 1.0.1
 * @date 2026-09-11
 * @description Проверяет явную web_search настройку RPC без ослабления штатных ограничений процесса.
 */

// @vitest-environment node

import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { JsonLineRPCClient } from "../../packages/codex-adapter/src/JsonLineRpcClient.adapter";
import type { JsonLineRPCClientOptions } from "../../packages/codex-adapter/src/JsonLineRpcClient.types";

const processMock = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock("node:child_process", () => ({ spawn: processMock.spawn }));

beforeEach(() => processMock.spawn.mockReset());

describe("RPC web-search arguments", () => {
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
        ],
        expect.objectContaining({ shell: false, cwd: "/fixture-snapshot" }),
      );
      const closed = client.close();
      child.emit("close");
      await closed;
    },
  );

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
