/**
 * @file tests/int/fixtures/aiConfiguration.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Собирает валидный fixture installation AI configuration foundation.
 * @docref Realize — AI Platform v1.0 — AI plugin data model
 * @see documentation/specifications/realize-ai-commerce/v1.0/03-runtime-delivery-and-security/21-ai-plugin-data-model.md
 */

import type {
  AIConfigArtifact,
  AIConfigDraft,
  AIConfigRelease,
  SystemAIConfigProjection,
} from "@realize/ai-contracts";
import {
  SYSTEM_CAPABILITY_REGISTRY,
  SYSTEM_CHECK_IDS,
  createAIConfigRelease,
} from "@realize/change-engine";

/** Полный связный набор installation artifacts для integration tests. */
export const AI_CONFIG_ARTIFACTS = [
  {
    allowedActions: ["category.assign"],
    capability: { id: "catalog.assignCategory.v1", version: "1.0" },
    enabled: true,
    key: "catalog-category",
    kind: "capability_binding",
    maxTargets: 1,
    readScopes: ["payload.products"],
    revision: 1,
    title: "Категории каталога",
    writeScopes: ["payload.products.categories"],
  },
  {
    checkID: "payload.access",
    enabled: true,
    key: "payload-access",
    kind: "check_binding",
    revision: 1,
    title: "Payload access",
  },
  {
    enabled: true,
    key: "planner",
    kind: "prompt_template",
    revision: 1,
    slot: "planner",
    template: "Запрос администратора: {{request}}",
    title: "Планировщик",
    variables: ["request"],
  },
  {
    enabled: true,
    instruction: "Изменяй каталог только через выбранные capability bindings.",
    key: "bounded-change",
    kind: "local_rule",
    priority: 50,
    revision: 1,
    title: "Bounded changes",
  },
  {
    capabilityBindingKeys: ["catalog-category"],
    enabled: true,
    instructions: "Готовь минимальные изменения данных каталога.",
    key: "catalog-editor",
    kind: "local_role",
    revision: 1,
    title: "Редактор каталога",
  },
  {
    capabilityBindingKeys: ["catalog-category"],
    description: "Назначает существующую категорию существующему товару.",
    enabled: true,
    instructions: "Сначала уточни товар и категорию, затем вызови binding.",
    key: "assign-category",
    kind: "skill",
    revision: 1,
    title: "Назначить категорию",
    triggerTerms: ["назначить категорию"],
  },
  {
    description: "Проводит один bounded catalog mutation flow.",
    enabled: true,
    entryStepKey: "plan",
    key: "catalog-edit",
    kind: "workflow_definition",
    maxSteps: 4,
    revision: 1,
    steps: [
      {
        key: "plan",
        nextStepKey: "change",
        promptTemplateKey: "planner",
        type: "agent_turn",
      },
      {
        capabilityBindingKey: "catalog-category",
        input: {
          categorySlug: { source: "literal", value: "accessories" },
          productSlug: { source: "literal", value: "classic-watch" },
        },
        key: "change",
        nextStepKey: "check",
        type: "capability",
      },
      {
        checkBindingKey: "payload-access",
        key: "check",
        nextStepKey: "done",
        type: "check",
      },
      { key: "done", outcome: "completed", type: "finish" },
    ],
    title: "Редактирование каталога",
  },
  {
    capabilityBindingKeys: ["catalog-category"],
    checkBindingKeys: ["payload-access"],
    defaultWorkflowKey: "catalog-edit",
    description: "Профиль админского агента каталога.",
    enabled: true,
    key: "admin",
    kind: "agent_profile",
    locale: "ru-RU",
    promptTemplateKeys: ["planner"],
    revision: 1,
    roleKeys: ["catalog-editor"],
    ruleKeys: ["bounded-change"],
    skillKeys: ["assign-category"],
    title: "Админский агент",
    workflowKeys: ["catalog-edit"],
  },
] satisfies readonly AIConfigArtifact[];

/** Возвращает detached ready draft, который тест может безопасно менять. */
export const createAIConfigDraftFixture = (
  source: readonly AIConfigArtifact[] = AI_CONFIG_ARTIFACTS,
): AIConfigDraft => ({
  artifacts: structuredClone(source),
  id: "admin-config",
  revision: 1,
  schemaVersion: "1.0",
  state: "ready",
});

/** Публикует fixture с одинаковыми metadata для deterministic hash assertions. */
export const createAIConfigReleaseFixture = (
  draft = createAIConfigDraftFixture(),
): AIConfigRelease =>
  createAIConfigRelease({
    createdAt: "2026-09-01T08:00:00.000Z",
    createdBy: "admin-1",
    draft,
    releaseID: "admin-config-v1",
    releaseVersion: 1,
    systemCompatibility: { maximumRelease: "1.9", minimumRelease: "1.0" },
  });

/** System ceiling для compiler integration tests. */
export const SYSTEM_AI_CONFIG_FIXTURE: SystemAIConfigProjection = {
  capabilities: SYSTEM_CAPABILITY_REGISTRY.list(),
  checkIDs: SYSTEM_CHECK_IDS,
  manifestHash: "a".repeat(64),
  projectProfile: "e-commerce",
  releaseID: "system-v1",
  version: "1.0",
};
