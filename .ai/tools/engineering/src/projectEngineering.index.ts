/**
 * @file .ai/tools/engineering/src/projectEngineering.index.ts
 * @version 1.2.0
 * @date 2026-11-09
 * @description Экспортирует trusted project binding и чистые renderer-функции артефактов.
 * @see documentation/architecture/engineering-artifacts.md
 */
export { createProjectArtifactBinding } from "./createProjectArtifactBinding.service.ts";
export { renderSourceTemplate } from "./renderSourceTemplate.util.ts";
export { renderAiTemplate } from "./renderAiTemplate.util.ts";
export { ProjectArtifactError } from "./ProjectArtifact.error.ts";
export type {
  ProjectArtifactBindingOptions,
  ProjectFolderPolicy,
  ProjectMovePolicy,
  SupportedArtifactKind,
  SourceTemplateInput,
  AiTemplateInput,
} from "./ProjectArtifactBinding.types.ts";
export { renderCodexAgent } from "./renderCodexAgent.util.ts";
export { validateCodexAgent } from "./validateCodexAgent.validator.ts";
export type { CodexAgentInput } from "./CodexAgent.types.ts";
