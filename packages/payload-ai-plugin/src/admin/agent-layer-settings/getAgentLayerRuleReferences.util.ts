/**
 * @file packages/payload-ai-plugin/src/admin/agent-layer-settings/getAgentLayerRuleReferences.util.ts
 * @version 1.0.0
 * @date 2026-09-10
 * @description Показывает существующие ссылки профилей без неявного изменения других артефактов.
 */
import type { AIConfigDraftDTO } from "@realize/ai-contracts";
import type { AgentLayerRuleReference } from "./AgentLayerConfiguration.types";
export const getAgentLayerRuleReferences = (
  draft: AIConfigDraftDTO,
  key: string,
): readonly AgentLayerRuleReference[] =>
  draft.artifacts.flatMap((artifact) =>
    artifact.kind === "agent_profile" && artifact.ruleKeys.includes(key)
      ? [
          {
            kind: "agent_profile" as const,
            key: artifact.key,
            title: artifact.title,
          },
        ]
      : [],
  );
