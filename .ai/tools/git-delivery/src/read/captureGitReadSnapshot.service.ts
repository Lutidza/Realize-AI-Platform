/**
 * @file .ai/tools/git-delivery/src/read/captureGitReadSnapshot.service.ts
 * @version 1.0.0
 * @date 2026-09-23
 * @description Строит ограниченный снимок разрешённых Git путей без обновления индекса.
 */
import { createHash } from "node:crypto";
import { lstat } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { hashRepositorySnapshot } from "../../../../../services/ai-control-plane/src/RepositoryCursor.service";
import { RepositoryReadError } from "../../../../../services/ai-control-plane/src/RepositoryRead.error";
import { openRepositoryDirectory } from "../../../../../services/ai-control-plane/src/openRepositoryDirectory.adapter";
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
  const files: GitReadFile[] = [];
  const tree = new Map(metadata.tree.map((entry) => [entry.path, entry]));
  const indexes = new Map<string, typeof metadata.index>();
  for (const entry of metadata.index) {
    const group = indexes.get(entry.path) ?? [];
    group.push(entry);
    indexes.set(entry.path, group);
  }
  let bytes = 0;
  for (const path of candidates.sort()) {
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
      continue;
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
      const held = await openRepositoryDirectory(
        context.policy,
        dirname(path) === "." ? "" : dirname(path),
      );
      try {
        const stat = await lstat(join(held.descriptorPath, basename(path)));
        if (!stat.isFile() || stat.nlink !== 1)
          throw new RepositoryReadError(
            "FORBIDDEN",
            "Требуется обычный файл без ссылок.",
          );
        const content = await readRepositoryFile(context.policy, path, {
          signal: context.signal,
          allowBinary: true,
        });
        bytes += content.bytes.length;
        if (bytes > REPOSITORY_MAX_SCAN_BYTES)
          throw new RepositoryReadError(
            "RESULT_LIMIT",
            "Снимок превышает предел чтения.",
          );
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
        await held.verify();
      } finally {
        await held.close();
      }
    } catch (error) {
      if (error instanceof RepositoryReadError && error.code === "FORBIDDEN") {
        if (paths) throw error;
        continue;
      }
      if (!(
        (error instanceof RepositoryReadError && error.code === "NOT_FOUND") ||
        (error as NodeJS.ErrnoException).code === "ENOENT"
      ))
        throw error;
    }
    if (head || entries.length || file.working) files.push(file);
  }
  if ((await readGitMetadata(context)).metadataHash !== metadata.metadataHash)
    throw new RepositoryReadError("CONFLICT", "Git изменился во время чтения.");
  const snapshotHash = hashRepositorySnapshot([
    metadata.head,
    metadata.branch,
    files.map((file) => [
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
    files,
    snapshotHash,
    metadataHash: metadata.metadataHash,
  };
}
