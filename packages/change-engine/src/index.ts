/**
 * @file packages/change-engine/src/index.ts
 * @version 1.3.0
 * @date 2026-09-11
 * @description Экспортирует Change Engine policies, registries и configuration compiler.
 */

import { createHash } from "node:crypto";

import { buildDataOperationProtocolInstructions } from "./dataOperationProtocol";

export { ChangePlanError } from "./ChangePlan.error";
export { assessChangePlanReadiness } from "./assessChangePlanReadiness.validator";
export { deriveChangePlan } from "./deriveChangePlan.service";
export type { DerivedChangePlan } from "./DerivedChangePlan.types";

const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

/** Hashes every security-relevant field bound by a plan decision. */
export const createPlanApprovalBinding = (input: {
  actorID: string;
  actorRoles: string[];
  changeRequestID: string;
  decision: "approved" | "rejected";
  expiresAt: string;
  planHash: string;
  scopeHash: string;
  version: number;
}): string =>
  sha256(
    JSON.stringify([
      input.changeRequestID,
      input.version,
      input.planHash,
      input.scopeHash,
      input.decision,
      input.actorID,
      [...input.actorRoles].sort(),
      input.expiresAt,
    ]),
  );

/** Effective capability matrix enforced by the first browser-chat slice. */
export const READ_ONLY_CAPABILITIES = Object.freeze({
  approvePlan: true,
  changeCode: false,
  changeTheme: false,
  deployPreview: false,
  deployProduction: false,
  mutateCatalog: false,
  mutateContent: false,
  readCMS: false,
  readProject: true,
  createChangeRequest: true,
  rollback: false,
});

/** Produces provider-independent developer instructions for a read-only run. */
export const buildReadOnlyDeveloperInstructions = (): string => {
  return [
    "You are the read-only Realize E-Commerce project assistant.",
    "Answer in Russian unless the user explicitly requests another language.",
    "You may inspect files inside the supplied repository root.",
    "Never modify files, Git state, databases, external services, or configuration.",
    "Do not use MCP servers, web search, network tools, package installation, or sub-agents.",
    "If the user asks for a change, explain or propose a plan but do not execute it.",
    "A change plan must name exact repository paths, risks, and verification commands so an admin can review it.",
    "Cite relevant repository paths in the final answer and state uncertainty honestly.",
    "Do not reveal secrets, environment values, hidden reasoning, or raw customer data.",
    buildDataOperationProtocolInstructions(),
  ].join("\n");
};

export * from "./dataOperationPolicy";
export * from "./dataOperationProtocol";
export * from "./aiConfigurationCompiler";
export * from "./aiConfigurationDraftPolicy";
export * from "./aiConfigurationError";
export * from "./aiConfigurationRelease";
export * from "./aiConfigurationSystemValidation";
export * from "./aiConfigurationValidation";
export * from "./canonicalJson";
export * from "./capabilityRegistry";
export * from "./executionCapability";
export * from "./executionPolicy";
export * from "./previewPolicy";
export * from "./releasePolicy";
export * from "./sourcePromotionPolicy";
export * from "./systemCapabilityRegistry";
export * from "./workflowPolicy";
export * from "./workflowExecutionState.validator";
export * from "./workflowExecutionTransitions.service";
export * from "./workflowValueResolution.service";
export * from "./buildWorkflowStepInstructions.service";
export * from "./toWorkflowRunSummary.mapper";

export * from "./buildChatDeveloperInstructions.service";
export { buildAIChatConfigurationInstructions } from "./buildAIChatConfigurationInstructions.service";
export { hashCompiledAgentConfiguration } from "./hashCompiledAgentConfiguration.util";
export { parseAIChatConfigurationSnapshot } from "./parseAIChatConfigurationSnapshot.validator";
export { toAIChatConfigurationSummary } from "./toAIChatConfigurationSummary.mapper";
