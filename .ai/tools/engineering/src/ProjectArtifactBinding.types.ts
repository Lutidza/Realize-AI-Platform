/**
 * @file .ai/tools/engineering/src/ProjectArtifactBinding.types.ts
 * @version 1.3.0
 * @date 2026-11-09
 * @description Описывает доверенные owner policies, evidence reader и входы шаблонов проекта.
 * @see documentation/architecture/engineering-artifacts.md
 */

export type SupportedSourceKind =
  | "source.util"
  | "source.service"
  | "source.adapter"
  | "source.component"
  | "source.types";
export type SupportedArtifactKind =
  SupportedSourceKind | "ai.template" | "codex.agent";
export type ArtifactProvenance = "authored" | "generated" | "mixed" | "vendor";

/** Root/owner приходят из host configuration, никогда из команды модели. */
export interface ProjectFolderPolicy {
  id: string;
  version: string;
  root: string;
  ownerRef: string;
  purpose: string;
  boundary:
    "owner" | "feature" | "client" | "server" | "contracts" | "generated";
  inheritsFrom?: readonly string[];
  allowedKinds?: readonly string[];
  allowedProvenance?: readonly ArtifactProvenance[];
  /** Точные workspace paths: исключается сам путь и всё его поддерево. */
  excludedPaths?: readonly string[];
  requiredCheckRefs?: readonly string[];
  /** Непустой список требует ещё не подключённого relationship resolver. */
  relationshipRules?: readonly string[];
  /** Исходники доверенной policy включаются в read manifest вместе с descriptor. */
  sourcePaths: readonly string[];
}

export interface ProjectArtifactBindingOptions {
  folderPolicies: readonly ProjectFolderPolicy[];
  /** Exact bounded read без записи; host гарантирует безопасный FS boundary. */
  readReference(path: string): Uint8Array;
  /** Необязательный bounded inventory; без него глобальная уникальность не заявляется. */
  templateIds?: readonly { id: string; path: string }[];
  /** Полноту области consumers подтверждает host; отсутствующая policy запрещает project move. */
  movePolicy?: ProjectMovePolicy;
}

export interface ProjectMovePolicy {
  changedOn: string;
  coverage: "complete";
  referenceRoots: readonly string[];
  sourcePaths: readonly string[];
  /** Host подтверждает всех транзитивных consumers общего paths owner в complete referenceRoots. */
  tsconfigWrite?: {
    /** Единственный явно разрешённый JSONC owner эффективного paths, вне source inventory. */
    path: string;
    allConsumersInReferenceRoots: true;
    /** Полный список активных non-nearest projects; каждый проверяет весь inventory. */
    projectConfigPaths?: readonly string[];
  };
  /** Shallow catalog и один exports owner; полноту consumers в referenceRoots гарантирует host. */
  packageExportsWrite?: {
    path: string;
    workspaceRoots: readonly string[];
    allConsumersInReferenceRoots: true;
  };
}

export interface EffectiveFolderPolicy {
  id: string;
  version: string;
  ownerRef: string;
  allowedKinds: string[];
  allowedProvenance: ArtifactProvenance[];
  requiredCheckRefs: string[];
  sourcePaths: string[];
  executionBoundary: "client" | "server" | null;
}

/** Дата передаётся явно доверенным host: renderer не читает системное время. */
export interface SourceTemplateInput {
  path: string;
  descriptionRu: string;
  body: string;
  createdOn: string;
  seeRefs?: readonly string[];
}

export interface AiTemplateInput {
  path: string;
  templateId: string;
  titleRu: string;
  purposeRu: string;
  usageRu: string;
  sections: readonly { headingRu: string; body: string }[];
  relatedArtifacts: readonly string[];
}
