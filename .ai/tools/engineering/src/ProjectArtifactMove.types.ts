/**
 * @file .ai/tools/engineering/src/ProjectArtifactMove.types.ts
 * @version 1.4.0
 * @date 2026-10-30
 * @description Описывает точные текстовые правки и контекст проверки виртуального результата переноса.
 * @see documentation/architecture/engineering-operations.md
 */
import type {
  ArtifactDescriptorPort,
  ArtifactInventoryPort,
  ResolvedArtifactDescriptor,
  ResolvedFolderDescriptor,
} from "@realize/engineering-runtime";
import type {
  ProjectArtifactBindingOptions,
  ProjectMovePolicy,
  SupportedArtifactKind,
} from "./ProjectArtifactBinding.types.ts";

export interface ArtifactTextEdit {
  start: number;
  end: number;
  text: string;
}
export interface ArtifactMoveTextInput {
  path: string;
  finalPath: string;
  source: string;
  from: string;
  to: string;
  files: ReadonlySet<string>;
  changedOn: string;
}
export interface SourceMoveTextInput extends ArtifactMoveTextInput {
  resolveReference(
    path: string,
    finalPath: string,
    specifier: string,
    mode?: "import" | "require",
  ): string;
}
export interface SourceMoveResolverInput {
  files: ReadonlySet<string>;
  from: string;
  to: string;
  referenceRoots: readonly string[];
  readPaths: Set<string>;
  readReference: ProjectArtifactBindingOptions["readReference"];
  tsconfigWrite?: ProjectMovePolicy["tsconfigWrite"];
  packageExportsWrite?: ProjectMovePolicy["packageExportsWrite"];
  /** Native host фиксирует только запрошенные namespaces, независимо от source inventory. */
  workspaceDirectories?: NonNullable<ArtifactInventoryPort["directories"]>;
}
export interface ConfigTargetReplacement {
  previous: string;
  next: string;
}
export interface SourceMoveConfigContext {
  fromPath: string;
  configPath?: string;
}
export interface ArtifactMoveCandidate {
  path: string;
  finalPath: string;
  kind: SupportedArtifactKind | "config.tsconfig" | "config.package-exports";
  original: Uint8Array;
  content: Uint8Array;
}
export interface ProjectArtifactMoveOptions {
  policy: ProjectMovePolicy | null;
  readReference: ProjectArtifactBindingOptions["readReference"];
  templateIds: NonNullable<ProjectArtifactBindingOptions["templateIds"]>;
  assertMoveBoundary(from: string, to: string): void;
  resolveFile(
    input: Parameters<ArtifactDescriptorPort["resolveFile"]>[0],
    readReference: ProjectArtifactBindingOptions["readReference"],
    templateIds: NonNullable<ProjectArtifactBindingOptions["templateIds"]>,
  ): ReturnType<ArtifactDescriptorPort["resolveFile"]>;
}
export interface ResolvedArtifactMoveCandidate extends ArtifactMoveCandidate {
  descriptor: ResolvedArtifactDescriptor;
}
export interface ProjectArtifactRelocation {
  candidates: ResolvedArtifactMoveCandidate[];
  readPaths: string[];
}
export interface ProjectDirectoryMoveOptions extends ProjectArtifactMoveOptions {
  resolveExistingDirectory(path: string): ResolvedFolderDescriptor;
}
