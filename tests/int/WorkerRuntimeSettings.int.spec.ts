/**
 * @file tests/int/WorkerRuntimeSettings.int.spec.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Проверяет живые переключатели очередей из БД и независимую инфраструктуру worker.
 */

// @vitest-environment node

import {
  CODEX_AGENT_SETTINGS_DEFAULTS,
  type CodexAgentSettingsDTO,
} from "@realize/ai-contracts";
import type { IntegrationRuntimeRepository } from "@realize/payload-ai-control/server/integration-runtime";
import { describe, expect, it, vi } from "vitest";
import { readExecutionWorkerConfig } from "../../services/ai-execution-worker/src/config";
import { readWorkerRuntimeSettings } from "../../services/ai-execution-worker/src/readWorkerRuntimeSettings.service";

const disabled = {
  executionEnabled: false,
  previewEnabled: false,
  sourcePromotionEnabled: false,
  releaseEnabled: false,
};
const enabled = {
  executionEnabled: true,
  previewEnabled: true,
  sourcePromotionEnabled: true,
  releaseEnabled: true,
};
const settings: CodexAgentSettingsDTO = {
  ...CODEX_AGENT_SETTINGS_DEFAULTS,
  execution: { ...CODEX_AGENT_SETTINGS_DEFAULTS.execution, enabled: true },
  preview: { ...CODEX_AGENT_SETTINGS_DEFAULTS.preview, enabled: true },
  sourcePromotion: { enabled: true },
  release: { ...CODEX_AGENT_SETTINGS_DEFAULTS.release, enabled: true },
};
const row = () => ({
  provider: "codex",
  connection_key: "codex:primary",
  enabled: true,
  revision: 1,
  configuration: { authMode: "chatgpt", agent: settings },
  credential_envelope: "fixture-encrypted-envelope",
});
const config = {
  sourcePromotionGitCommand: "/fixture/git",
  releaseOrchestratorCommand: "/fixture/orchestrator",
};

describe("Worker settings из текущей интеграции", () => {
  it("изменяет разрешения между чтениями без перезапуска и без credential lease", async () => {
    let current: Awaited<
      ReturnType<IntegrationRuntimeRepository["readPrimaryCodex"]>
    > = row();
    const repository = { readPrimaryCodex: vi.fn(async () => current) };
    const input = { repository, config };
    expect(await readWorkerRuntimeSettings(input)).toEqual(enabled);
    current = { ...row(), enabled: false, revision: 2 };
    expect(await readWorkerRuntimeSettings(input)).toEqual(disabled);
    current = {
      ...row(),
      revision: 3,
      configuration: {
        authMode: "chatgpt",
        agent: {
          ...settings,
          execution: { ...settings.execution, enabled: false },
          release: { ...settings.release, enabled: false },
        },
      },
    };
    expect(await readWorkerRuntimeSettings(input)).toEqual({
      ...disabled,
      sourcePromotionEnabled: true,
    });
    current = row();
    expect(await readWorkerRuntimeSettings(input)).toEqual(enabled);
    expect(repository.readPrimaryCodex).toHaveBeenCalledTimes(4);
  });

  it.each([
    undefined,
    { ...row(), enabled: false },
    { ...row(), provider: "github" },
    { ...row(), connection_key: "codex:other" },
    { ...row(), revision: 0 },
    { ...row(), revision: "invalid" },
    { ...row(), credential_envelope: null },
    { ...row(), credential_envelope: "" },
    { ...row(), configuration: { authMode: "unsupported" } },
    { ...row(), configuration: { authMode: "chatgpt", agent: { model: 123 } } },
    {
      ...row(),
      configuration: { authMode: "workloadIdentity", agent: settings },
    },
  ])(
    "запрещает claim для отсутствующей или недопустимой интеграции %#",
    async (current) => {
      expect(
        await readWorkerRuntimeSettings({
          repository: { readPrimaryCodex: async () => current },
          config,
        }),
      ).toEqual(disabled);
    },
  );

  it("оставляет legacy интеграцию без разрешений записи", async () => {
    expect(
      await readWorkerRuntimeSettings({
        repository: {
          readPrimaryCodex: async () => ({
            ...row(),
            configuration: { authMode: "chatgpt" },
          }),
        },
        config,
      }),
    ).toEqual(disabled);
  });

  it("сохраняет явный workload identity без native credential", async () => {
    expect(
      await readWorkerRuntimeSettings({
        repository: {
          readPrimaryCodex: async () => ({
            ...row(),
            credential_envelope: null,
            configuration: { authMode: "workloadIdentity", agent: settings },
          }),
        },
        config,
      }),
    ).toEqual(enabled);
  });

  it("не берёт release и source очереди до настройки соответствующего executable", async () => {
    expect(
      await readWorkerRuntimeSettings({
        repository: { readPrimaryCodex: async () => row() },
        config: {},
      }),
    ).toEqual({
      ...enabled,
      releaseEnabled: false,
      sourcePromotionEnabled: false,
    });
  });

  it("закрывает все очереди при ошибке БД и восстанавливается следующим чтением", async () => {
    const repository = {
      readPrimaryCodex: vi
        .fn()
        .mockRejectedValueOnce(new Error("fixture-private-driver-detail"))
        .mockResolvedValueOnce(row()),
    };
    expect(await readWorkerRuntimeSettings({ repository, config })).toEqual(
      disabled,
    );
    expect(await readWorkerRuntimeSettings({ repository, config })).toEqual(
      enabled,
    );
  });
});

describe("Инфраструктура execution worker", () => {
  const environment: NodeJS.ProcessEnv = {
    NODE_ENV: "test",
    DATABASE_URI: "postgres://fixture-only/unused",
    REALIZE_AI_EXECUTION_SIGNING_SECRET: "fixture-signing-key-".repeat(3),
  };

  it("запускается без env переключателей и не возвращает старые модели", () => {
    const result = readExecutionWorkerConfig({
      ...environment,
      REALIZE_AI_ENABLED: "false",
      REALIZE_AI_EXECUTION_ENABLED: "false",
      REALIZE_AI_PREVIEW_ENABLED: "true",
      REALIZE_AI_RELEASE_ENABLED: "true",
      REALIZE_AI_SOURCE_PROMOTION_ENABLED: "true",
      REALIZE_AI_MODEL: "fixture-unselected-model",
      REALIZE_AI_EXECUTION_MODEL: "fixture-unselected-execution",
      REALIZE_AI_REVIEW_MODEL: "fixture-unselected-review",
    });
    for (const key of [
      "model",
      "reviewModel",
      "previewEnabled",
      "sourcePromotionEnabled",
      "releaseEnabled",
    ])
      expect(result).not.toHaveProperty(key);
    expect(result.sourcePromotionGitCommand).toBeUndefined();
    expect(result.releaseOrchestratorCommand).toBeUndefined();
  });

  it("запрещает запуск в изолированной проверке и preview независимо от прежних flags", () => {
    expect(() =>
      readExecutionWorkerConfig({
        ...environment,
        REALIZE_AI_EXECUTION_ENABLED: "true",
        REALIZE_AI_RUNTIME_ISOLATED: "true",
      }),
    ).toThrow("isolated runtime");
  });

  it.each([
    "REALIZE_AI_GITHUB_GIT_COMMAND",
    "REALIZE_AI_RELEASE_ORCHESTRATOR_COMMAND",
  ])("проверяет absolute executable %s, когда он задан", (key) => {
    expect(() =>
      readExecutionWorkerConfig({ ...environment, [key]: "relative-command" }),
    ).toThrow("absolute executable");
    expect(() =>
      readExecutionWorkerConfig({ ...environment, [key]: "/fixture\0command" }),
    ).toThrow("absolute executable");
    expect(() =>
      readExecutionWorkerConfig({ ...environment, [key]: "/fixture/command" }),
    ).not.toThrow();
  });
});
