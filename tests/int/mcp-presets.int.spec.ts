/**
 * @file tests/int/mcp-presets.int.spec.ts
 * @version 1.0.0
 * @date 2026-09-24
 * @description Проверяет полноту preset-контрактов и отказ неизвестным либо повторным tools.
 */
import { describe, expect, it } from "vitest";
import { MCP_REALIZE_TOOLS, MCP_SERVER_PRESETS } from "@realize/ai-contracts";
import { mcpConfigurationSchema } from "../../packages/ai-contracts/src/mcpManagementInputs.config";

describe("MCP preset contracts", () => {
  it("accepts all current tools and stable unique server IDs", () => {
    expect(
      new Set(MCP_SERVER_PRESETS.map((preset) => preset.serverID)).size,
    ).toBe(MCP_SERVER_PRESETS.length);
    for (const preset of MCP_SERVER_PRESETS) {
      expect(
        mcpConfigurationSchema.safeParse(preset.configuration).success,
      ).toBe(true);
    }
    expect(
      mcpConfigurationSchema.safeParse({
        ...MCP_SERVER_PRESETS[0]!.configuration,
        allowedTools: [...MCP_REALIZE_TOOLS],
      }).success,
    ).toBe(true);
  });
  it.each([["repo_read_file", "repo_read_file"], ["repo_write_file"]])(
    "rejects invalid tools %j",
    (...allowedTools) => {
      expect(
        mcpConfigurationSchema.safeParse({
          ...MCP_SERVER_PRESETS[0]!.configuration,
          allowedTools,
        }).success,
      ).toBe(false);
    },
  );
});
