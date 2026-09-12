/**
 * @file packages/payload-ai-plugin/src/admin/agent-layer-settings/getAgentLayerArtifactRelations.util.ts
 * @version 1.0.0
 * @date 2026-09-10
 * @description Разрешает прямые и обратные ссылки записей по точной паре вида и ключа.
 */

import type { AIConfigArtifact } from "@realize/ai-contracts";
import type {
  AgentLayerArtifactReference,
  AgentLayerArtifactRelations,
} from "./AgentLayerArtifact.types";

const identity = ({ kind, key }: AgentLayerArtifactReference) =>
  `${kind}:${key}`;

const referencesFrom = (
  artifact: AIConfigArtifact,
): readonly AgentLayerArtifactReference[] => {
  const references: AgentLayerArtifactReference[] = [];
  const add = (
    kind: AgentLayerArtifactReference["kind"],
    keys: readonly string[],
  ) => keys.forEach((key) => references.push({ kind, key }));

  switch (artifact.kind) {
    case "agent_profile":
      add("capability_binding", artifact.capabilityBindingKeys);
      add("check_binding", artifact.checkBindingKeys);
      add("prompt_template", artifact.promptTemplateKeys);
      add("local_role", artifact.roleKeys);
      add("local_rule", artifact.ruleKeys);
      add("skill", artifact.skillKeys);
      add("workflow_definition", artifact.workflowKeys);
      // Показываем и ошибочную ссылку, которую validator не нашёл в workflowKeys.
      if (artifact.defaultWorkflowKey)
        add("workflow_definition", [artifact.defaultWorkflowKey]);
      break;
    case "local_role":
    case "skill":
      add("capability_binding", artifact.capabilityBindingKeys);
      break;
    case "workflow_definition":
      artifact.steps.forEach((step) => {
        if (step.type === "agent_turn" || step.type === "request_input")
          add("prompt_template", [step.promptTemplateKey]);
        if (step.type === "capability")
          add("capability_binding", [step.capabilityBindingKey]);
        if (step.type === "check") add("check_binding", [step.checkBindingKey]);
      });
      break;
  }

  return [
    ...new Map(references.map((value) => [identity(value), value])).values(),
  ];
};

/** Строит связи всего каталога за один обход записей и уникальных ссылок. */
export const buildAgentLayerArtifactRelationIndex = (
  artifacts: readonly AIConfigArtifact[],
): ReadonlyMap<string, AgentLayerArtifactRelations> => {
  const byIdentity = new Map(artifacts.map((item) => [identity(item), item]));
  const index = new Map(
    artifacts.map(
      (artifact) =>
        [
          identity(artifact),
          {
            incoming: [] as AIConfigArtifact[],
            outgoing: referencesFrom(artifact).map((reference) => {
              const target = byIdentity.get(identity(reference));
              return { reference, ...(target ? { artifact: target } : {}) };
            }),
          },
        ] as const,
    ),
  );
  artifacts.forEach((artifact) => {
    index.get(identity(artifact))?.outgoing.forEach(({ reference }) => {
      index.get(identity(reference))?.incoming.push(artifact);
    });
  });
  return index;
};

/** Возвращает уникальные записи, не смешивая системные и внутренние связи шагов. */
export const getAgentLayerArtifactRelations = (
  artifacts: readonly AIConfigArtifact[],
  artifact: AIConfigArtifact,
): AgentLayerArtifactRelations => {
  const byIdentity = new Map(artifacts.map((item) => [identity(item), item]));
  const selectedIdentity = identity(artifact);
  return {
    incoming: artifacts.filter((item) =>
      referencesFrom(item).some(
        (reference) => identity(reference) === selectedIdentity,
      ),
    ),
    outgoing: referencesFrom(artifact).map((reference) => {
      const target = byIdentity.get(identity(reference));
      return { reference, ...(target ? { artifact: target } : {}) };
    }),
  };
};
