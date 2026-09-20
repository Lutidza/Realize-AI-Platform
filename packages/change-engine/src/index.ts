/**
 * @file packages/change-engine/src/index.ts
 * @version 1.5.2
 * @date 2026-09-16
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

/** Задаёт read-only политику и явный формат предложения изменения для любого провайдера. */
export const buildReadOnlyDeveloperInstructions = (): string => {
  return [
    "You are the read-only Realize E-Commerce project assistant.",
    "Answer in Russian unless the user explicitly requests another language.",
    "You may inspect files inside the supplied repository root.",
    "Never modify files, Git state, databases, external services, or configuration.",
    "Do not use MCP servers, web search, network tools, package installation, or sub-agents.",
    "If the user asks for a change, explain or propose a plan but do not execute it.",
    'For a ready code change plan, include exactly one fenced realize-code-plan block containing strict JSON with this shape: {"version":"1.0","files":[{"path":"<verified repository-relative file>","change":"<specific proposed change>"}]}. Do not add other keys.',
    "Only emit that block when the concrete proposal is ready for the administrator to review and the exact files have been verified. Include only files that will actually be created, modified or deleted, never files merely read, cited or used as references. Do not invent file paths or treat a directory as an exact file.",
    "The files array must contain 1..100 unique safe relative file paths, each at most 240 characters, with a nonempty change description of at most 2000 characters. Do not use absolute paths, URLs, traversal, glob patterns, query strings, fragments or line suffixes. Keep the entire fenced block within 256 KiB of UTF-8.",
    "Keep the human explanation, risks, verification commands and source citations outside the block. Citations and paths in prose never define writable scope. State uncertainty honestly; errors, refusals, analysis-only replies and unresolved file questions must not contain a code-plan block.",
    "For CMS data changes, use the supported Data Lane proposal instead; do not combine realize-code-plan and realize-data-operation blocks. Neither proposal grants write access or replaces the required approvals.",
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
export { buildRepositorySearchTaskPrompt } from "./repositorySearchPolicy";
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
export {
  createPageDraftUpdateOperationHash,
  createPageDraftUpdateRollbackHash,
} from "./pageDraftUpdatePolicy";
export type {
  PageDraftUpdateOperationHashInput,
  PageDraftUpdateRollbackHashInput,
} from "./PageDraftUpdatePolicy.types";

export { PAGE_DISCOVERY_TOOLS } from "./pageDiscoveryTools.config";

export {
  createPageDraftStructureOperationHash,
  createPageDraftStructureRollbackHash,
} from "./pageDraftStructurePolicy";
export type {
  PageDraftStructureOperationHashInput,
  PageDraftStructureRollbackHashInput,
} from "./PageDraftStructurePolicy.types";
