/**
 * @file tests/int/fixtures/agentLayerConfiguration.ts
 * @version 1.0.0
 * @date 2026-09-10
 * @description Даёт изолированные DTO агентского редактора без изменения реальных настроек.
 */
import type {
  AIConfigBootstrapDTO,
  AIConfigDraftDTO,
  AILocalRuleDefinition,
} from "@realize/ai-contracts";
export const agentLayerRule: AILocalRuleDefinition = {
  kind: "local_rule",
  key: "local.rule",
  title: "Локальное правило",
  instruction: "Отвечай кратко.",
  priority: 20,
  enabled: true,
  revision: 3,
};
export const agentLayerDraft: AIConfigDraftDTO = {
  id: "draft-fixture",
  revision: 2,
  schemaVersion: "1.0",
  state: "editing",
  artifactCount: 3,
  createdAt: "2026-09-10T10:00:00.000Z",
  updatedAt: "2026-09-10T10:00:00.000Z",
  createdBy: "fixture",
  updatedBy: "fixture",
  baseRelease: { id: "release-base", manifestHash: "a".repeat(64) },
  artifacts: [
    agentLayerRule,
    {
      kind: "local_role",
      key: "local.role",
      title: "Роль",
      instructions: "Только разрешённые действия.",
      enabled: true,
      revision: 7,
      capabilityBindingKeys: [],
    },
    {
      kind: "agent_profile",
      key: "local.agent",
      title: "Редактор каталога",
      enabled: true,
      revision: 4,
      description: "Профиль",
      locale: "ru",
      capabilityBindingKeys: [],
      checkBindingKeys: [],
      promptTemplateKeys: [],
      roleKeys: ["local.role"],
      ruleKeys: ["local.rule"],
      skillKeys: [],
      workflowKeys: [],
    },
  ],
};
export const agentLayerBootstrap: AIConfigBootstrapDTO = {
  schemaVersion: "1.0",
  activePointer: null,
  drafts: [agentLayerDraft],
  releases: [],
  system: {
    releaseID: "system-fixture",
    version: "1.0.0",
    projectProfile: "commerce",
    manifestHash: "b".repeat(64),
    capabilities: [],
    checkIDs: [],
  },
};
