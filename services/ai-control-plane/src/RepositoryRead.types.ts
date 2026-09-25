/**
 * @file services/ai-control-plane/src/RepositoryRead.types.ts
 * @version 1.0.0
 * @date 2026-09-23
 * @description Описывает общую политику, проверенные файлы и ограниченный обход репозитория.
 */

/** Полномочия задаёт сервер, а не входные параметры инструмента. */
export type RepositoryReadPolicy = {
  root: string;
  device: number;
  inode: number;
  developerInstructions: boolean;
  version: string;
};

export type RepositoryDirectory = {
  descriptorPath: string;
  verify: () => Promise<void>;
  close: () => Promise<void>;
};

export type RepositoryReadOptions = { signal?: AbortSignal };
export type RepositoryFile = {
  path: string;
  bytes: Buffer;
  text: string;
  sha256: string;
  binary: boolean;
  mode: number;
};
export type RepositoryEntry = {
  path: string;
  type: "file" | "directory";
  size: number | null;
  fingerprint: string;
};
export type RepositoryWalkOptions = RepositoryReadOptions & {
  path?: string;
  depth?: number;
  maxEntries?: number;
};
export type RepositoryWalk = {
  entries: RepositoryEntry[];
  truncated: boolean;
  inspectedEntries: number;
};
