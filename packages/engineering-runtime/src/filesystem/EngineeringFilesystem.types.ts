/**
 * @file packages/engineering-runtime/src/filesystem/EngineeringFilesystem.types.ts
 * @version 1.5.0
 * @date 2026-10-29
 * @description Описывает versioned filesystem mutation manifest и приватные handles backend.
 * @see documentation/architecture/engineering-operations.md
 */
import type { ArtifactDescriptorPort } from "../artifacts/ArtifactDescriptor.types.ts";
import type { EngineeringStore } from "../storage/engineeringStorage.index.ts";
import type { NativeFilesystem } from "../native/engineeringNative.index.ts";
import type { EngineeringPrincipal } from "../runtime/EngineeringRuntime.types.ts";
import type { PlannedEffect } from "../runtime/EngineeringResult.types.ts";
import type {
  ResolvedArtifactDescriptor,
  ResolvedFolderDescriptor,
} from "../artifacts/ArtifactDescriptor.types.ts";

export interface FilesystemIdentity {
  kind: "file" | "directory";
  dev: string;
  ino: string;
  mode: number;
  size: number | null;
  sha256: string | null;
}
export interface NamespaceEntry {
  name: string;
  kind: string;
  dev: string;
  ino: string;
}
export interface ManifestEntry {
  path: string;
  identity: FilesystemIdentity | null;
  children: NamespaceEntry[] | null;
}
/** Полный bounded tree; version скрывает inode/dev за canonical SHA-256. */
export interface FilesystemTree {
  version: string;
  entries: ManifestEntry[];
}
export interface PreparedDirectoryFilesystemMove {
  inputs: FilesystemMutationInput[];
  effects: PlannedEffect[];
  descriptors: (ResolvedArtifactDescriptor | ResolvedFolderDescriptor)[];
  trackedPaths: string[];
  sourceEntries: ManifestEntry[];
}
export interface CreationStep {
  /** Цель create/edit/move или исходный путь quarantine remove. */
  path: string;
  kind: "create_file" | "create_directory" | "edit_file" | "move" | "remove";
  fromPath: string | null;
  /** Private staging для create/edit, quarantine для remove, null для move. */
  stagedName: string | null;
  identity: FilesystemIdentity | null;
  sourceIdentity: FilesystemIdentity | null;
  contentSha256: string | null;
}
/** Подготовленные bytes и identity до создания private staging; dependent edit может следовать за move. */
export interface FilesystemMutationInput {
  path: string;
  kind: CreationStep["kind"];
  fromPath?: string;
  index: number;
  bytes: Uint8Array | null;
  sourceIdentity?: FilesystemIdentity;
  mode?: number;
}
export interface CreationManifest {
  version: 1;
  stagingId: string;
  stagingIdentity: FilesystemIdentity;
  steps: CreationStep[];
  trackedPaths: string[];
  before: ManifestEntry[];
  bindingHash: string;
}
export interface LocalFilesystemOptions {
  store: EngineeringStore;
  principal: EngineeringPrincipal;
  filesDirectory: string;
  native: NativeFilesystem;
  /** Синхронный read grant host; при ограниченном доступе проверяется и при повторном snapshot/recovery. */
  canReadReference?: (path: string) => boolean;
  descriptors: (
    readReference: (path: string) => Uint8Array,
  ) => ArtifactDescriptorPort;
  now?: () => number;
}
