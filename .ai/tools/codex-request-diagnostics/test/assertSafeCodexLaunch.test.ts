/**
 * @file .ai/tools/codex-request-diagnostics/test/assertSafeCodexLaunch.test.ts
 * @version 1.0.0
 * @date 2026-11-19
 * @description Проверяет отказ от неаудированных raw-log sinks без отключения обязательных hooks.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { assertConfigTextHasNoRawSinks } from "../src/assertSafeCodexLaunch.util.ts";

test("обычные model/MCP настройки не требуют отключения hooks", () => {
  assert.doesNotThrow(() =>
    assertConfigTextHasNoRawSinks(
      'model = "fixture-model"\n[mcp_servers.fixture]\nenabled = false\n',
    ),
  );
});

test("notify/hooks/managed hooks и escaped keys требуют аудита", () => {
  for (const config of [
    'notify = ["synthetic-private-sink"]',
    '"notify" = ["synthetic-private-sink"]',
    'hooks.fixture = "synthetic-private-sink"',
    '[hooks]\nfixture = "synthetic-private-sink"',
    '[managed_hooks.fixture]\ncommand = "synthetic-private-sink"',
    '"\\u006eotify" = ["synthetic-private-sink"]',
    'hook_files = ["synthetic-private-sink"]',
  ]) {
    assert.throws(
      () => assertConfigTextHasNoRawSinks(config),
      (error: unknown) =>
        error instanceof Error &&
        /^exec_(?:configured_hooks_present|configuration_unverified)$/.test(
          error.message,
        ) &&
        !error.message.includes("synthetic-private-sink"),
    );
  }
});

test("чужая shell policy и remote selectors не подменяются настройками observer", () => {
  for (const config of [
    '[shell_environment_policy]\nexclude = ["CUSTOM"]',
    'shell_environment_policy = { exclude = ["CUSTOM"] }',
    'shell_environment_policy.exclude = ["CUSTOM"]',
    'cloud_config = "synthetic-private-sink"',
    'managed_config_bundle = "synthetic-private-sink"',
  ])
    assert.throws(() => assertConfigTextHasNoRawSinks(config), {
      message: "exec_configuration_unverified",
    });
});
