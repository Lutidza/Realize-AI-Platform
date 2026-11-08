/**
 * @file packages/engineering-runtime/src/artifacts/ArtifactDescriptor.types.ts
 * @version 1.4.0
 * @date 2026-10-30
 * @description Задаёт доверенный контракт размещения и native-проверок создаваемых артефактов.
 * @see documentation/architecture/engineering-artifacts.md
 */
import type { VersionRef } from "../runtime/EngineeringResult.types.ts";

export interface ResolvedArtifactDescriptor {
  kindId: string;
  definitionVersion: number;
  ownerRef: string;
  provenance: "authored";
  folderPolicyRef: VersionRef;
  metadataProfileRef: VersionRef;
  templateRef: VersionRef | null;
  ruleRefs: string[];
  requiredCheckRefs: string[];
  validatedChecks: string[];
  readPaths: string[];
}
export interface ResolvedFolderDescriptor {
  folderPolicyRef: VersionRef;
  ownerRef: string;
  purpose: string;
  readPaths: string[];
  requiredCheckRefs: string[];
  validatedChecks: string[];
}
/** Read-only обход закрытой host-области; core включает namespaces и файлы в frozen manifest. */
export interface ArtifactInventoryPort {
  files(roots: readonly string[]): readonly string[];
  /** Shallow namespace snapshot без source scan; null означает доказанное отсутствие. */
  directories?(path: string, maximumEntries: number): readonly string[] | null;
}
export interface ArtifactMoveInput {
  from: string;
  to: string;
  artifactKind: string;
  content: Uint8Array;
}
export interface ResolvedArtifactEdit {
  path: string;
  expectedSha256: string;
  content: Uint8Array;
  descriptor: ResolvedArtifactDescriptor;
}
/** Новые bytes не записываются binding: core добавляет явные edit effects после rename. */
export interface ResolvedArtifactMove {
  content: Uint8Array;
  descriptor: ResolvedArtifactDescriptor;
  edits: ResolvedArtifactEdit[];
  readPaths: string[];
}
export interface ArtifactDirectoryMoveInput {
  from: string;
  to: string;
  /** Полный состав исходного дерева приходит от descriptor-relative core, без private identities. */
  files: readonly string[];
  directories: readonly string[];
}
export interface ResolvedArtifactRelocation extends ResolvedArtifactEdit {
  /** Исходный путь; совпадает с path только у внешнего consumer. */
  from: string;
}
export interface ResolvedDirectoryRelocation {
  from: string;
  to: string;
  source: ResolvedFolderDescriptor;
  destination: ResolvedFolderDescriptor;
}
export interface ResolvedArtifactDirectoryMove {
  files: ResolvedArtifactRelocation[];
  directories: ResolvedDirectoryRelocation[];
  readPaths: string[];
}
/** Host регистрирует policies; запрос не может заменить owner или объявить свои проверки пройденными. */
export interface ArtifactDescriptorPort {
  readonly definitionHash: string;
  resolveFile(input: {
    path: string;
    artifactKind: string;
    content: Uint8Array;
  }): ResolvedArtifactDescriptor;
  /** Existing profile определяет trusted owner, core не знает проектных kind names. */
  resolveExistingFile?(input: {
    path: string;
    content: Uint8Array;
    /** Dependent-only native profile не разрешает прямую file action. */
    purpose?: "dependent_edit";
  }): ResolvedArtifactDescriptor;
  prepareMove?(
    input: ArtifactMoveInput,
    inventory: ArtifactInventoryPort,
  ): ResolvedArtifactMove;
  prepareDirectoryMove?(
    input: ArtifactDirectoryMoveInput,
    inventory: ArtifactInventoryPort,
  ): ResolvedArtifactDirectoryMove;
  resolveDirectory(input: {
    path: string;
    purpose: string;
    folderPolicyId: string;
    plannedFilePaths: readonly string[];
  }): ResolvedFolderDescriptor;
}
