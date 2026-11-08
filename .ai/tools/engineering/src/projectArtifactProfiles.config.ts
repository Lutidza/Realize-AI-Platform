/**
 * @file .ai/tools/engineering/src/projectArtifactProfiles.config.ts
 * @version 1.6.0
 * @date 2026-10-30
 * @description Регистрирует поддержанные authored profiles и источники их формальных guards.
 * @see documentation/architecture/engineering-artifacts.md
 */
import type { SupportedSourceKind } from "./ProjectArtifactBinding.types.ts";

/** Формат определяет кандидата; naming/content/owner guards подтверждают descriptor. */
export const SOURCE_ARTIFACT_PROFILES = {
  "source.util": {
    role: "util",
    extensions: ["ts", "mjs", "mts", "cjs", "cts"],
  },
  "source.service": {
    role: "service",
    extensions: ["ts", "js", "mjs", "mts", "cjs", "cts"],
  },
  "source.adapter": {
    role: "adapter",
    extensions: ["ts", "js", "mjs", "mts", "cjs", "cts"],
  },
  "source.component": { role: "component", extensions: ["tsx", "jsx"] },
  "source.types": { role: "types", extensions: ["ts"] },
} as const satisfies Record<
  SupportedSourceKind,
  { role: string; extensions: readonly string[] }
>;

export const BASE_AI_TEMPLATE =
  ".ai/templates/markdown/TEMPLATE-AI-RUNTIME-MARKDOWN.md";
export const SOURCE_HEADER_TEMPLATE =
  ".ai/templates/code-comments/TEMPLATE-TSDOC-FILE-HEADER.md";
export const SOURCE_RULE_REFS = [
  ".ai/rules/development/RULE-CODE-STRUCTURE.md",
  ".ai/rules/development/RULE-CODE-NAMING.md",
  ".ai/rules/development/RULE-CODE-COMMENT-DISCIPLINE.md",
] as const;
export const TEMPLATE_RULE_REFS = [
  ".ai/rules/global/RULE-WORKING-ARTIFACT-LANGUAGE.md",
  ".ai/rules/documentation/RULE-CANONICAL-DOCUMENTATION-BEFORE-CONTRACT-CHANGE.md",
] as const;
export const BINDING_SOURCE_PATHS = [
  ".ai/tools/engineering/src/projectArtifactProfiles.config.ts",
  ".ai/tools/engineering/src/resolveProjectFolderPolicy.validator.ts",
  ".ai/tools/engineering/src/createProjectArtifactBinding.service.ts",
  ".ai/tools/engineering/src/resolveProjectArtifactKind.util.ts",
  ".ai/tools/engineering/src/resolveNativeConfigArtifact.service.ts",
  ".ai/tools/engineering/src/collectArtifactReferences.service.ts",
  ".ai/tools/engineering/src/ProjectArtifactBinding.types.ts",
  ".ai/tools/source-headers/src/sourceHeaders.config.ts",
  ".ai/tools/quality/readMarkdownLinks.util.ts",
  ".ai/tools/quality/maskMarkdownCode.util.ts",
  ".ai/tools/quality/MarkdownReference.types.ts",
] as const;
export const SOURCE_VALIDATOR_PATHS = [
  ".ai/tools/engineering/src/validateSourceArtifact.validator.ts",
  ".ai/tools/source-headers/src/validateSourceHeader.validator.ts",
  ".ai/tools/source-headers/src/readLeadingComments.util.ts",
  ".ai/tools/agent-search/src/parseSyntaxSource.util.mjs",
  ".ai/tools/agent-search/src/parseSyntaxSource.util.d.mts",
  ".ai/tools/agent-search/src/syntaxSearch.config.mjs",
] as const;
export const TEMPLATE_VALIDATOR_PATHS = [
  ".ai/tools/engineering/src/validateAiTemplate.validator.ts",
] as const;
export const MOVE_SOURCE_PATHS = [
  ".ai/tools/engineering/src/preparePackageExportsMove.service.ts",
  ".ai/tools/engineering/src/rewritePackageExports.util.ts",
  ".ai/tools/engineering/src/readJsonProperties.util.ts",
  ".ai/tools/agent-search/src/readPackageExports.util.mjs",
  ".ai/tools/agent-search/src/readPackageExports.util.d.mts",
  ".ai/tools/agent-search/src/syntaxSearch.config.d.mts",
  ".ai/tools/engineering/src/prepareWildcardTsconfigMove.service.ts",
  ".ai/tools/engineering/src/assertProjectMoveMembership.service.ts",
  ".ai/tools/agent-search/src/loadImportProjectFiles.service.mjs",
  ".ai/tools/agent-search/src/loadImportProjectFiles.service.d.mts",
  ".ai/tools/engineering/src/prepareTsconfigMove.service.ts",
  ".ai/tools/engineering/src/rewriteTsconfigPaths.util.ts",
  ".ai/tools/agent-search/src/styleModuleTarget.util.mjs",
  ".ai/tools/agent-search/src/styleModuleTarget.util.d.mts",
  ".ai/tools/engineering/src/createSourceMoveResolver.service.ts",
  ".ai/tools/agent-search/src/resolveModulePath.service.mjs",
  ".ai/tools/agent-search/src/resolveModulePath.service.d.mts",
  ".ai/tools/agent-search/src/loadImportConfiguration.service.mjs",
  ".ai/tools/agent-search/src/loadImportConfiguration.service.d.mts",
  ".ai/tools/agent-search/src/createImportReadContext.service.mjs",
  ".ai/tools/agent-search/src/createImportReadContext.service.d.mts",
  ".ai/tools/agent-search/src/runImportReadSteps.service.mjs",
  ".ai/tools/agent-search/src/selectModulePattern.util.mjs",
  ".ai/tools/agent-search/src/selectModulePattern.util.d.mts",
  ".ai/tools/agent-search/src/findModuleAliasSpecifiers.util.mjs",
  ".ai/tools/agent-search/src/findModuleAliasSpecifiers.util.d.mts",
  ".ai/tools/agent-search/src/ImportResolution.types.d.mts",
  ".ai/tools/agent-search/src/importResolution.config.mjs",
  ".ai/tools/agent-search/src/importResolution.config.d.mts",

  ".ai/tools/engineering/src/prepareProjectArtifactRelocation.service.ts",
  ".ai/tools/engineering/src/prepareProjectDirectoryMove.service.ts",
  ".ai/tools/engineering/src/mapMovedArtifactPath.util.ts",
  ".ai/tools/engineering/src/ProjectArtifactMove.types.ts",
  ".ai/tools/engineering/src/validateProjectMovePolicy.validator.ts",
  ".ai/tools/engineering/src/prepareProjectArtifactMove.service.ts",
  ".ai/tools/engineering/src/rewriteSourceMove.util.ts",
  ".ai/tools/engineering/src/rewriteTemplateMove.util.ts",
  ".ai/tools/engineering/src/applyArtifactTextEdits.util.ts",
  ".ai/tools/agent-search/src/parseSyntaxSource.util.mjs",
  ".ai/tools/agent-search/src/parseSyntaxSource.util.d.mts",
  ".ai/tools/agent-search/src/syntaxSearch.config.mjs",
  ".ai/tools/agent-search/src/readSyntaxModuleReference.util.mjs",
  ".ai/tools/agent-search/src/readSyntaxModuleReference.util.d.mts",
  ".ai/tools/agent-search/src/SyntaxSearch.types.d.mts",
  ".ai/tools/agent-search/src/getModuleFileCandidates.util.mjs",
  ".ai/tools/agent-search/src/getModuleFileCandidates.util.d.mts",
] as const;
export const ARTIFACT_LIMITS = Object.freeze({
  contentBytes: 256 * 1024,
  referenceBytes: 256 * 1024,
  totalReferenceBytes: 4 * 1024 * 1024,
  references: 128,
  policies: 64,
  inventory: 1024,
});
