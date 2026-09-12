/**
 * @file tests/int/agentLayerRuleUpdate.int.spec.ts
 * @version 1.0.0
 * @date 2026-09-10
 * @description Проверяет сохранение других kinds, monotonic revisions и защиту ссылок редактора.
 */
import { describe, expect, it } from "vitest";
import { buildAgentLayerRuleUpdate } from "../../packages/payload-ai-plugin/src/admin/agent-layer-settings/buildAgentLayerRuleUpdate.mapper";
import { buildAgentLayerRuleRemoval } from "../../packages/payload-ai-plugin/src/admin/agent-layer-settings/buildAgentLayerRuleRemoval.mapper";
import { buildAgentLayerDraftInput } from "../../packages/payload-ai-plugin/src/admin/agent-layer-settings/buildAgentLayerDraftInput.mapper";
import {
  agentLayerDraft,
  agentLayerRule,
} from "./fixtures/agentLayerConfiguration";

describe("local rule draft updates", () => {
  it("changes only the rule revision and preserves all other kinds and baseRelease", () => {
    const input = {
      key: agentLayerRule.key,
      title: agentLayerRule.title,
      instruction: "Новая инструкция.",
      priority: agentLayerRule.priority,
      enabled: false,
    };
    const result = buildAgentLayerRuleUpdate(
      agentLayerDraft,
      input,
      agentLayerRule.key,
    );
    expect(result.expectedRevision).toBe(2);
    expect(result.baseRelease).toEqual(agentLayerDraft.baseRelease);
    expect(result.artifacts[0]).toMatchObject({
      revision: 4,
      enabled: false,
      instruction: input.instruction,
    });
    expect(result.artifacts.slice(1)).toEqual(
      agentLayerDraft.artifacts.slice(1),
    );
    expect(agentLayerDraft.artifacts[0]).toEqual(agentLayerRule);
  });
  it("keeps unchanged artifact revision and starts new rule identity at one", () => {
    const unchanged = buildAgentLayerRuleUpdate(
      agentLayerDraft,
      agentLayerRule,
      agentLayerRule.key,
    );
    expect(unchanged.artifacts[0].revision).toBe(3);
    const added = buildAgentLayerRuleUpdate(agentLayerDraft, {
      key: "new.rule",
      title: "Новое",
      instruction: "Инструкция",
      priority: 0,
      enabled: true,
    });
    expect(added.artifacts.at(-1)).toMatchObject({
      key: "new.rule",
      revision: 1,
    });
  });
  it("does not silently delete or rewrite profile references", () => {
    expect(() =>
      buildAgentLayerRuleRemoval(agentLayerDraft, "local.rule"),
    ).toThrow("Редактор каталога");
    expect(() =>
      buildAgentLayerRuleUpdate(
        agentLayerDraft,
        { ...agentLayerRule, key: "renamed.rule" },
        "local.rule",
      ),
    ).toThrow("Редактор каталога");
    const unreferenced = {
      ...agentLayerDraft,
      artifacts: agentLayerDraft.artifacts.filter(
        (artifact) => artifact.kind !== "agent_profile",
      ),
    };
    expect(
      buildAgentLayerRuleRemoval(unreferenced, "local.rule").artifacts,
    ).toEqual([agentLayerDraft.artifacts[1]]);
  });
  it("copies every artifact at revision one and keeps source lineage unchanged", () => {
    const source = { ...agentLayerDraft, state: "released" as const };
    const copy = buildAgentLayerDraftInput("draft-copy", source);
    expect(copy.expectedRevision).toBe(0);
    expect(copy.baseRelease).toEqual(source.baseRelease);
    expect(copy.artifacts.map((artifact) => artifact.revision)).toEqual([
      1, 1, 1,
    ]);
    expect(source.artifacts.map((artifact) => artifact.revision)).toEqual([
      3, 7, 4,
    ]);
    expect(() =>
      buildAgentLayerRuleUpdate(source, agentLayerRule, agentLayerRule.key),
    ).toThrow("только для чтения");
  });
});
