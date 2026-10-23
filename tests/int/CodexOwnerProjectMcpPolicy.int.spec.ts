/**
 * @file tests/int/CodexOwnerProjectMcpPolicy.int.spec.ts
 * @version 1.0.0
 * @date 2026-10-23
 * @description Проверяет provenance owner MCP и реальное слияние config/read без запуска модели.
 */

// @vitest-environment node

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir, userInfo } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { CodexOwnerProjectMcpPolicy } from "../../packages/codex-adapter/src/CodexOwnerProjectMcpPolicy.validator";
import { JsonLineRPCClient } from "../../packages/codex-adapter/src/JsonLineRpcClient.adapter";

const fixture = (server: Record<string, unknown> = { command: "fixture" }) => {
  const name = { type: "project", dotCodexFolder: "/fixture/.codex" };
  const config = { mcp_servers: { fixture: server } };
  const paths = (value: unknown, prefix: string): string[] =>
    value && typeof value === "object" && Object.keys(value).length
      ? Object.entries(value).flatMap(([key, child]) =>
          paths(child, `${prefix}.${key}`),
        )
      : [prefix];
  return {
    config,
    origins: Object.fromEntries(
      paths(server, "mcp_servers.fixture").map((key) => [
        key,
        { name, version: "fixture-version" },
      ]),
    ),
    layers: [{ config, name, version: "fixture-version" }],
  };
};

describe("owner project MCP provenance", () => {
  it("сохраняет __proto__ как имя сервера в serialized pin и запрете", () => {
    const response = JSON.parse(
      JSON.stringify(fixture())
        .replaceAll("fixture.command", "__proto__.command")
        .replaceAll('"fixture":', '"__proto__":'),
    );
    const policy = new CodexOwnerProjectMcpPolicy(response, "/fixture", true);
    expect(policy.allows({ server: "__proto__", tool: "allowed" })).toBe(true);
    expect(JSON.parse(JSON.stringify(policy.config))).toEqual({
      mcp_servers: JSON.parse('{"__proto__":{"command":"fixture"}}'),
    });
    const disabled = new CodexOwnerProjectMcpPolicy(
      response,
      "/fixture",
      false,
    );
    expect(JSON.stringify(disabled.config)).toBe(
      '{"mcp_servers":{"__proto__":{"enabled":false}}}',
    );
  });
  it.each(["user", "system", "sessionFlags", "enterpriseManaged"])(
    "отклоняет effective field из слоя %s",
    (type) => {
      const response = fixture();
      response.origins["mcp_servers.fixture.command"].name.type = type;
      expect(
        () => new CodexOwnerProjectMcpPolicy(response, "/fixture", true),
      ).toThrow("Не удалось подтвердить");
    },
  );

  it.each([
    "missing-origin",
    "version",
    "other-root",
    "disabled-layer",
    "not-defined",
  ])("отклоняет недоказанный project источник %s", (kind) => {
    const response = fixture();
    if (kind === "missing-origin")
      delete response.origins["mcp_servers.fixture.command"];
    if (kind === "version")
      response.origins["mcp_servers.fixture.command"].version = "other";
    if (kind === "other-root")
      response.layers[0].name.dotCodexFolder = "/other/.codex";
    if (kind === "disabled-layer")
      Object.assign(response.layers[0], { disabledReason: "untrusted" });
    if (kind === "not-defined")
      Object.assign(response.layers[0], { config: {} });
    expect(
      () => new CodexOwnerProjectMcpPolicy(response, "/fixture", true),
    ).toThrow("Не удалось подтвердить");
  });

  it("сохраняет enabled_tools/disabled_tools и выключенные серверы", () => {
    const policy = new CodexOwnerProjectMcpPolicy(
      fixture({
        command: "fixture",
        enabled_tools: ["allowed", "disabled"],
        disabled_tools: ["disabled"],
      }),
      "/fixture",
      true,
    );
    expect(policy.allows({ server: "fixture", tool: "allowed" })).toBe(true);
    expect(policy.allows({ server: "fixture", tool: "disabled" })).toBe(false);
    expect(policy.allows({ server: "fixture", tool: "unlisted" })).toBe(false);
    const disabled = new CodexOwnerProjectMcpPolicy(
      fixture({ command: "fixture", enabled: false }),
      "/fixture",
      true,
    );
    expect(disabled.config).toEqual({
      mcp_servers: { fixture: { enabled: false } },
    });
    expect(disabled.allows({ server: "fixture", tool: "allowed" })).toBe(false);
  });

  it.each([
    { enabled_tools: ["invalid\nname"] },
    { disabled_tools: "all" },
    { enabled: "yes" },
  ])("отклоняет некорректные ограничения %j", (fields) => {
    expect(
      () =>
        new CodexOwnerProjectMcpPolicy(
          fixture({ command: "fixture", ...fields }),
          "/fixture",
          true,
        ),
    ).toThrow("Не удалось подтвердить");
  });

  it.skipIf(!process.env.REALIZE_CODEX_CONFIG_TEST_BINARY)(
    "installed App Server сохраняет project MCP при пустом override; policy подтверждает provenance без turn",
    async () => {
      const directory = await mkdtemp(
        join(tmpdir(), "realize-owner-mcp-config-"),
      );
      const root = join(directory, "project");
      const profile = join(directory, "profile");
      await mkdir(join(root, ".codex"), { recursive: true });
      await mkdir(join(root, ".git"));
      await mkdir(profile);
      await writeFile(
        join(root, ".codex", "config.toml"),
        '[mcp_servers.fixture_project]\ncommand="/bin/false"\nargs=["--fixture"]\ndisabled_tools=[]\n[mcp_servers.fixture_empty]\ncommand="/bin/false"\nenabled_tools=[]\n[mcp_servers.fixture_disabled]\ncommand="/bin/false"\nenabled=false\n',
      );
      const client = new JsonLineRPCClient({
        codexBinary: process.env.REALIZE_CODEX_CONFIG_TEST_BINARY,
        environment: {
          NODE_ENV: "test",
          CODEX_HOME: profile,
          HOME: directory,
          PATH: `${dirname(process.execPath)}:/usr/bin:/bin`,
        },
        ownerHost: {
          workspaceRoot: root,
          osUser: userInfo().username,
          trustedProjectMcp: true,
        },
        workingDirectory: root,
      });
      try {
        client.start();
        await client.request("initialize", {
          clientInfo: { name: "realize-config-regression", version: "1" },
          capabilities: null,
        });
        client.notify("initialized");
        const config = await client.request("config/read", {
          cwd: root,
          includeLayers: true,
        });
        const policy = new CodexOwnerProjectMcpPolicy(config, root, true);
        expect(
          policy.allows({
            server: "fixture_project",
            tool: "any_configured_tool",
          }),
        ).toBe(true);
        expect(
          policy.allows({ server: "fixture_disabled", tool: "any_tool" }),
        ).toBe(false);
        expect(
          policy.allows({ server: "fixture_empty", tool: "any_tool" }),
        ).toBe(false);
        const denied = new CodexOwnerProjectMcpPolicy(config, root, false);
        expect(denied.config).toEqual({
          mcp_servers: {
            fixture_project: { enabled: false },
            fixture_disabled: { enabled: false },
            fixture_empty: { enabled: false },
          },
        });
      } finally {
        await client.close();
        await rm(directory, { recursive: true, force: true });
      }
    },
    15_000,
  );
});
