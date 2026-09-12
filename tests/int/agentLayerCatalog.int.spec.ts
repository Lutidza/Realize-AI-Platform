/**
 * @file tests/int/agentLayerCatalog.int.spec.ts
 * @version 1.0.0
 * @date 2026-09-10
 * @description Проверяет страницы большого каталога и совместную работу поиска, фильтров и сортировки.
 */

import type {
  AIConfigArtifact,
  AILocalRuleDefinition,
} from "@realize/ai-contracts";
import { describe, expect, it } from "vitest";
import type { AgentLayerCatalogState } from "../../packages/payload-ai-plugin/src/admin/agent-layer-settings/AgentLayerCatalog.types";
import { selectAgentLayerCatalog } from "../../packages/payload-ai-plugin/src/admin/agent-layer-settings/selectAgentLayerCatalog.util";
import {
  agentLayerDraft,
  agentLayerRule,
} from "./fixtures/agentLayerConfiguration";

const defaultState: AgentLayerCatalogState = {
  search: "",
  status: "all",
  usage: "all",
  sort: "title",
  page: 1,
};
const profile = agentLayerDraft.artifacts.find(
  (artifact) => artifact.kind === "agent_profile",
)!;
const createRules = (count: number): readonly AILocalRuleDefinition[] =>
  Array.from({ length: count }, (_, offset) => ({
    ...agentLayerRule,
    key: `rule-${offset + 1}`,
    title: `Правило ${offset + 1}`,
    enabled: (offset + 1) % 2 === 0,
    instruction: offset >= 450 ? "Проверять каталог" : "Отвечать кратко",
  }));

describe("agent layer catalog", () => {
  it("makes all 512 records reachable without omissions or duplicates across 25-row pages", () => {
    const artifacts = [...createRules(512)].reverse();
    const first = selectAgentLayerCatalog(artifacts, defaultState);
    expect(first).toMatchObject({
      totalCount: 512,
      filteredCount: 512,
      page: 1,
      pageCount: 21,
      rangeStart: 1,
      rangeEnd: 25,
    });
    expect(first.rows).toHaveLength(25);
    expect(first.rows[0].artifact.key).toBe("rule-1");
    const visited = [...first.rows];
    for (let page = 2; page <= first.pageCount; page += 1) {
      const selection = selectAgentLayerCatalog(artifacts, {
        ...defaultState,
        page,
      });
      expect(selection.rows.length).toBeLessThanOrEqual(25);
      visited.push(...selection.rows);
    }
    expect(visited).toHaveLength(512);
    expect(new Set(visited.map(({ artifact }) => artifact.key)).size).toBe(512);
    expect(visited.at(-1)?.artifact.key).toBe("rule-512");
    expect(
      selectAgentLayerCatalog(artifacts, { ...defaultState, page: 21 }),
    ).toMatchObject({ rangeStart: 501, rangeEnd: 512 });
    expect(artifacts[0].key).toBe("rule-512");
  });

  it("searches content and applies status before forming the requested page", () => {
    const result = selectAgentLayerCatalog(
      createRules(512),
      {
        ...defaultState,
        search: "  ПРОВЕРЯТЬ КАТАЛОГ  ",
        status: "enabled",
        page: 2,
      },
      "local_rule",
    );
    expect(result).toMatchObject({
      totalCount: 512,
      filteredCount: 31,
      page: 2,
      pageCount: 2,
      rangeStart: 26,
      rangeEnd: 31,
      hasFilters: true,
    });
    expect(result.rows.map(({ artifact }) => artifact.key)).toEqual([
      "rule-502",
      "rule-504",
      "rule-506",
      "rule-508",
      "rule-510",
      "rule-512",
    ]);
  });

  it("returns to the nearest existing page after deleting the last row or narrowing the search", () => {
    const artifacts = createRules(51);
    const state = { ...defaultState, page: 3 };
    expect(selectAgentLayerCatalog(artifacts, state).rows).toHaveLength(1);
    const remaining = artifacts.slice(0, -1);
    const afterRemoval = selectAgentLayerCatalog(remaining, state);
    expect(afterRemoval).toMatchObject({
      page: 2,
      pageCount: 2,
      rangeStart: 26,
      rangeEnd: 50,
    });
    expect(afterRemoval.rows).toHaveLength(25);
    const narrowed = selectAgentLayerCatalog(remaining, {
      ...state,
      search: "Правило 49",
    });
    expect(narrowed).toMatchObject({ page: 1, pageCount: 1, filteredCount: 1 });
    expect(narrowed.rows[0].artifact.key).toBe("rule-49");
    expect(
      selectAgentLayerCatalog(remaining, {
        ...state,
        search: "Несуществующая запись",
      }),
    ).toMatchObject({
      rows: [],
      page: 1,
      pageCount: 1,
      rangeStart: 0,
      rangeEnd: 0,
      filteredCount: 0,
    });
    expect(state.page).toBe(3);
  });

  it("combines search, status and usage without borrowing references from another kind with the same key", () => {
    const rule = { ...agentLayerRule, key: "shared", title: "Каталог" };
    const role: AIConfigArtifact = {
      kind: "local_role",
      key: "shared",
      title: "Каталог",
      enabled: true,
      revision: 1,
      instructions: "Проверять каталог",
      capabilityBindingKeys: [],
    };
    const source = {
      ...profile,
      enabled: false,
      ruleKeys: ["shared"],
      roleKeys: [],
    };
    const artifacts = [
      role,
      source,
      rule,
      { ...rule, key: "shared-disabled", enabled: false },
    ];
    const state: AgentLayerCatalogState = {
      ...defaultState,
      search: "SHARED",
      status: "enabled",
      usage: "used",
    };
    const used = selectAgentLayerCatalog(artifacts, state, "local_rule");
    expect(used.totalCount).toBe(2);
    expect(used.rows).toEqual([
      { artifact: rule, summary: rule.instruction, usageCount: 1 },
    ]);
    const unused = selectAgentLayerCatalog(artifacts, {
      ...state,
      usage: "unused",
    });
    expect(
      unused.rows.map(({ artifact }) => `${artifact.kind}:${artifact.key}`),
    ).toEqual(["local_role:shared"]);
  });

  it("keeps usage and revision rankings stable when equally named records arrive in a different order", () => {
    const a = {
      ...agentLayerRule,
      key: "a",
      title: "Одинаковое название",
      revision: 8,
    };
    const b = { ...a, key: "b" };
    const c = { ...a, key: "c", title: "Часто используемое", revision: 2 };
    const d = { ...a, key: "d", title: "Без ссылок", revision: 3 };
    const artifacts = [
      d,
      b,
      c,
      a,
      { ...profile, ruleKeys: ["a", "b", "c"] },
      { ...profile, key: "second-profile", ruleKeys: ["c"] },
    ];
    for (const [sort, expected] of [
      ["usage", ["c", "a", "b", "d"]],
      ["revision", ["a", "b", "d", "c"]],
    ] as const) {
      const state = { ...defaultState, sort };
      const original = selectAgentLayerCatalog(artifacts, state, "local_rule");
      const reversed = selectAgentLayerCatalog(
        [...artifacts].reverse(),
        state,
        "local_rule",
      );
      expect(original.rows.map(({ artifact }) => artifact.key)).toEqual(
        expected,
      );
      expect(reversed.rows).toEqual(original.rows);
    }
  });
});
