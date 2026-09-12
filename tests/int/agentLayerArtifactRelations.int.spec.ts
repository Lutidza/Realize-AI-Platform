/**
 * @file tests/int/agentLayerArtifactRelations.int.spec.ts
 * @version 1.0.0
 * @date 2026-09-10
 * @description Проверяет точные связи каталога, потерянные цели и переходы из шагов процессов.
 */

import type {
  AIConfigArtifact,
  WorkflowDefinition,
} from "@realize/ai-contracts";
import { describe, expect, it } from "vitest";
import {
  buildAgentLayerArtifactRelationIndex,
  getAgentLayerArtifactRelations,
} from "../../packages/payload-ai-plugin/src/admin/agent-layer-settings/getAgentLayerArtifactRelations.util";
import { AI_CONFIG_ARTIFACTS } from "./fixtures/aiConfiguration";

const profile = AI_CONFIG_ARTIFACTS.find(
  (artifact) => artifact.kind === "agent_profile",
)!;
const workflow = AI_CONFIG_ARTIFACTS.find(
  (artifact) => artifact.kind === "workflow_definition",
)!;

describe("agent layer artifact relations", () => {
  it("includes all seven profile target kinds without counting the default workflow twice", () => {
    const { outgoing, incoming } = getAgentLayerArtifactRelations(
      AI_CONFIG_ARTIFACTS,
      profile,
    );
    expect(outgoing.map(({ reference }) => reference.kind)).toEqual([
      "capability_binding",
      "check_binding",
      "prompt_template",
      "local_role",
      "local_rule",
      "skill",
      "workflow_definition",
    ]);
    expect(outgoing.every(({ artifact }) => Boolean(artifact))).toBe(true);
    expect(incoming).toEqual([]);
  });

  it("distinguishes equal keys belonging to different kinds and retains disabled sources", () => {
    const rule: AIConfigArtifact = {
      kind: "local_rule",
      key: "shared",
      title: "Правило",
      enabled: false,
      revision: 1,
      priority: 50,
      instruction: "Инструкция",
    };
    const role: AIConfigArtifact = {
      kind: "local_role",
      key: "shared",
      title: "Роль",
      enabled: true,
      revision: 1,
      instructions: "Инструкции",
      capabilityBindingKeys: [],
    };
    const source = {
      ...profile,
      enabled: false,
      ruleKeys: ["shared"],
      roleKeys: [],
    };
    const artifacts = [rule, role, source];
    expect(getAgentLayerArtifactRelations(artifacts, rule).incoming).toEqual([
      source,
    ]);
    expect(getAgentLayerArtifactRelations(artifacts, role).incoming).toEqual(
      [],
    );
    expect(
      getAgentLayerArtifactRelations(artifacts, source).outgoing.find(
        ({ reference }) => reference.kind === "local_rule",
      )?.artifact,
    ).toBe(rule);
  });

  it("keeps missing and disabled targets visible, including an invalid default workflow", () => {
    const source = {
      ...profile,
      ruleKeys: ["missing-rule"],
      workflowKeys: [],
      defaultWorkflowKey: "missing-workflow",
    };
    const artifacts = AI_CONFIG_ARTIFACTS.map((artifact) =>
      artifact.kind === "skill" ? { ...artifact, enabled: false } : artifact,
    );
    const { outgoing } = getAgentLayerArtifactRelations(artifacts, source);
    expect(
      outgoing.find(({ reference }) => reference.kind === "skill")?.artifact
        ?.enabled,
    ).toBe(false);
    expect(outgoing.filter(({ artifact }) => !artifact)).toEqual([
      { reference: { kind: "local_rule", key: "missing-rule" } },
      { reference: { kind: "workflow_definition", key: "missing-workflow" } },
    ]);
  });

  it("deduplicates workflow artifact links and excludes transitions and step-output dependencies", () => {
    const source: WorkflowDefinition = {
      ...workflow,
      steps: [
        ...workflow.steps,
        {
          key: "ask",
          type: "request_input",
          promptTemplateKey: "planner",
          nextStepKey: "branch",
        },
        {
          key: "branch",
          type: "branch",
          condition: {
            left: { source: "step_output", stepKey: "change", path: "ok" },
            operator: "exists",
          },
          trueStepKey: "done",
          falseStepKey: "ask",
        },
      ],
    };
    const { outgoing } = getAgentLayerArtifactRelations(
      AI_CONFIG_ARTIFACTS,
      source,
    );
    expect(outgoing.map(({ reference }) => reference)).toEqual([
      { kind: "prompt_template", key: "planner" },
      { kind: "capability_binding", key: "catalog-category" },
      { kind: "check_binding", key: "payload-access" },
    ]);
  });

  it("collects inbound references from profiles, roles, skills and workflow steps once per source", () => {
    const capability = AI_CONFIG_ARTIFACTS.find(
      (artifact) => artifact.kind === "capability_binding",
    )!;
    const source = {
      ...workflow,
      steps: [...workflow.steps, ...workflow.steps],
    };
    const artifacts = AI_CONFIG_ARTIFACTS.map((artifact) =>
      artifact.kind === "workflow_definition" ? source : artifact,
    );
    expect(
      getAgentLayerArtifactRelations(artifacts, capability).incoming.map(
        (artifact) => artifact.kind,
      ),
    ).toEqual(["local_role", "skill", "workflow_definition", "agent_profile"]);
  });

  it("keeps system registry references separate and indexes every persisted kind consistently", () => {
    const index = buildAgentLayerArtifactRelationIndex(AI_CONFIG_ARTIFACTS);
    expect(index.size).toBe(8);
    AI_CONFIG_ARTIFACTS.forEach((artifact) => {
      expect(index.get(`${artifact.kind}:${artifact.key}`)).toEqual(
        getAgentLayerArtifactRelations(AI_CONFIG_ARTIFACTS, artifact),
      );
      if (
        artifact.kind === "capability_binding" ||
        artifact.kind === "check_binding"
      )
        expect(index.get(`${artifact.kind}:${artifact.key}`)?.outgoing).toEqual(
          [],
        );
    });
  });
});
