/**
 * @file tests/int/codexSearchSettings.int.spec.ts
 * @version 1.0.0
 * @date 2026-09-30
 * @description Проверяет legacy read, строгую запись режима поиска и безопасную проекцию реального каталога.
 * @see documentation/architecture/codex-integration.md
 */
// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  CODEX_AGENT_SETTINGS_DEFAULTS,
  parseCodexAgentSettings,
  parseCodexIntegrationConfiguration,
  parseCodexModelPage,
} from "@realize/ai-contracts";
import {
  buildRepositorySearchInstructions,
  buildRepositorySearchTaskPrompt,
  buildChatDeveloperInstructions,
} from "@realize/change-engine";

describe("Codex configurable repository discovery", () => {
  it("читает прежние настройки с direct defaults, но не допускает неполную новую запись", () => {
    const { search: _search, ...legacy } = CODEX_AGENT_SETTINGS_DEFAULTS;
    expect(
      parseCodexIntegrationConfiguration({ authMode: "chatgpt", agent: legacy })
        .agent.search.mode,
    ).toBe("direct");
    expect(() => parseCodexAgentSettings(legacy)).toThrow();
    expect(() =>
      parseCodexAgentSettings({
        ...CODEX_AGENT_SETTINGS_DEFAULTS,
        search: { ...CODEX_AGENT_SETTINGS_DEFAULTS.search, mode: "subagent" },
      }),
    ).toThrow();
    expect(() =>
      parseCodexAgentSettings({
        ...CODEX_AGENT_SETTINGS_DEFAULTS,
        search: { ...CODEX_AGENT_SETTINGS_DEFAULTS.search, root: "/" },
      }),
    ).toThrow();
  });
  it("разрешает native search только явно выбранному режиму и сохраняет bounded контракт", () => {
    const native = {
      ...CODEX_AGENT_SETTINGS_DEFAULTS.search,
      mode: "subagent" as const,
      model: "fixture-economy-model",
    };
    expect(buildRepositorySearchTaskPrompt("task")).toContain("directly");
    expect(buildRepositorySearchInstructions()).toContain(
      "Do not spawn search agents",
    );
    expect(buildRepositorySearchTaskPrompt("task", native)).toContain(
      native.model,
    );
    expect(buildRepositorySearchInstructions(native)).toContain(
      "Only one child",
    );
    expect(buildChatDeveloperInstructions(false, native)).not.toContain(
      "Do not use sub-agents",
    );
    expect(buildChatDeveloperInstructions(false, native)).toContain(
      "Do not use web search",
    );
    expect(
      buildRepositorySearchInstructions({ ...native, enabled: false }),
    ).toContain("disabled");
  });
  it("проецирует только текущие picker поля, исключает скрытые модели и не выдумывает цены", () => {
    const model = {
      model: "fixture-economy-model",
      displayName: "Fixture economy",
      description: "Fixture provider description",
      isDefault: false,
      hidden: false,
      multiAgentVersion: "v1",
      privateMetadata: "do-not-project",
    };
    const result = parseCodexModelPage({
      data: [model, { ...model, hidden: true }],
      nextCursor: null,
    });
    expect(result.models).toHaveLength(1);
    expect(result.models[0]).toEqual({
      model: model.model,
      displayName: model.displayName,
      description: model.description,
      isDefault: false,
      multiAgentVersion: "v1",
    });
    expect(JSON.stringify(result)).not.toContain("do-not-project");
    expect(() =>
      parseCodexModelPage({ data: [{ ...model, model: "invalid model" }] }),
    ).toThrow();
  });
});
