/**
 * @file .ai/tools/git-delivery/src/read/captureGitReadSnapshot.service.ts
 * @version 1.0.1
 * @date 2026-10-20
 * @description Строит ограниченный снимок разрешённых Git путей без обновления индекса.
 */
import { createHash } from "node:crypto";
import { hashRepositorySnapshot } from "../../../../../services/ai-control-plane/src/RepositoryCursor.service";
import { RepositoryReadError } from "../../../../../services/ai-control-plane/src/RepositoryRead.error";
import { readRepositoryFile } from "../../../../../services/ai-control-plane/src/readRepositoryFile.service";
import {
  isRepositoryPathAllowed,
  parseRepositoryPath,
  REPOSITORY_MAX_SCAN_BYTES,
} from "../../../../../services/ai-control-plane/src/repositoryReadPolicy.validator";
import { walkRepository } from "../../../../../services/ai-control-plane/src/walkRepository.service";
import type {
  GitReadContext,
  GitReadFile,
  GitReadSnapshot,
} from "./GitRead.types";
import { readGitMetadata } from "./readGitMetadata.adapter";

/** paths приходит только из строгого DTO; policy/principal/root задаёт composition. */
export async function captureGitReadSnapshot(
  context: GitReadContext,
  paths?: string[],
): Promise<GitReadSnapshot> {
  for (const path of paths ?? []) {
    parseRepositoryPath(path);
    if (!isRepositoryPathAllowed(context.policy, path))
      throw new RepositoryReadError(
        "FORBIDDEN",
        "Путь исключён политикой Git чтения.",
      );
  }
  const metadata = await readGitMetadata(context);
  const scan = paths
    ? null
    : await walkRepository(context.policy, { signal: context.signal });
  if (scan?.truncated)
    throw new RepositoryReadError(
      "RESULT_LIMIT",
      "Снимок Git превышает предел обхода.",
    );
  const excluded = [...metadata.index, ...metadata.tree]
    .filter((entry) => !["100644", "100755"].includes(entry.mode))
    .map((entry) => entry.path);
  const candidates = paths ?? [
    ...new Set([
      ...metadata.index.map((entry) => entry.path),
      ...metadata.tree.map((entry) => entry.path),
      ...(scan?.entries
        .filter((entry) => entry.type === "file")
        .map((entry) => entry.path) ?? []),
    ]),
  ];
  const files: Array<GitReadFile | null> = [];
  const tree = new Map(metadata.tree.map((entry) => [entry.path, entry]));
  const indexes = new Map<string, typeof metadata.index>();
  for (const entry of metadata.index) {
    const group = indexes.get(entry.path) ?? [];
    group.push(entry);
    indexes.set(entry.path, group);
  }
  let bytes = 0;
  const readFile = async (path: string): Promise<GitReadFile | null> => {
    if (
      !isRepositoryPathAllowed(context.policy, path) ||
      excluded.some(
        (prefix) => path === prefix || path.startsWith(`${prefix}/`),
      )
    ) {
      if (paths)
        throw new RepositoryReadError(
          "FORBIDDEN",
          "Ссылки и вложенные checkout недоступны.",
        );
      return null;
    }
    const head = tree.get(path) ?? null;
    const entries = indexes.get(path) ?? [];
    const index = entries.find((entry) => entry.stage === 0) ?? null;
    const file: GitReadFile = {
      path,
      head,
      index,
      working: null,
      conflicted: entries.some((entry) => entry.stage !== 0),
      binary: false,
    };
    try {
      // Общий reader удерживает parents и проверяет nofollow/inode/nlink до выдачи bytes.
      const content = await readRepositoryFile(context.policy, path, {
        signal: context.signal,
        allowBinary: true,
        onReadBytes: (count) => {
          bytes += count;
          if (bytes > REPOSITORY_MAX_SCAN_BYTES)
            throw new RepositoryReadError(
              "RESULT_LIMIT",
              "Снимок превышает предел чтения.",
            );
        },
      });
      file.binary = content.binary;
      file.working = {
        bytes: content.bytes,
        sha256: content.sha256,
        mode: content.mode & 0o111 ? "100755" : "100644",
        oid: createHash(metadata.objectFormat)
          .update(`blob ${content.bytes.length}\0`)
          .update(content.bytes)
          .digest("hex"),
      };
    } catch (error) {
      if (error instanceof RepositoryReadError && error.code === "FORBIDDEN") {
        if (paths) throw error;
        return null;
      }
      if (!(
        (error instanceof RepositoryReadError && error.code === "NOT_FOUND") ||
        (error as NodeJS.ErrnoException).code === "ENOENT"
      ))
        throw error;
    }
    return head || entries.length || file.working ? file : null;
  };
  const ordered = candidates.sort();
  let next = 0;
  let failed = false;
  let failure: unknown;
  // Пул ограничивает открытые файлы; отказ прекращает новые reads и дожидается cleanup активных.
  await Promise.all(
    Array.from({ length: Math.min(8, ordered.length) }, async () => {
      while (!failed && next < ordered.length) {
        const index = next++;
        try {
          files[index] = await readFile(ordered[index]);
        } catch (error) {
          if (!failed) failure = error;
          failed = true;
        }
      }
    }),
  );
  if (failed) throw failure;
  const included = files.filter((file): file is GitReadFile => file !== null);
  if ((await readGitMetadata(context)).metadataHash !== metadata.metadataHash)
    throw new RepositoryReadError("CONFLICT", "Git изменился во время чтения.");
  const snapshotHash = hashRepositorySnapshot([
    metadata.head,
    metadata.branch,
    included.map((file) => [
      file.path,
      file.head,
      indexes.get(file.path),
      file.working?.sha256,
      file.working?.mode,
      file.conflicted,
    ]),
  ]);
  return {
    branch: metadata.branch,
    head: metadata.head,
    unborn: metadata.head === null,
    detached: metadata.branch === null && metadata.head !== null,
    files: included,
    snapshotHash,
    metadataHash: metadata.metadataHash,
  };
}
