/**
 * @file services/ai-control-plane/src/projectContextCatalog.service.ts
 * @version 1.1.0
 * @date 2026-09-20
 * @description Собирает Context Pack через общую безопасную политику чтения репозитория.
 */
import type {
  ProjectContextEntry,
  ProjectContextQuery,
} from "./ProjectContext.types";
import { RepositoryReadError } from "./RepositoryRead.error";
import { readRepositoryFile } from "./readRepositoryFile.service";
import {
  createRepositoryReadPolicy,
  REPOSITORY_MAX_SCAN_BYTES,
  REPOSITORY_ROOT_DIRECTORIES,
  REPOSITORY_ROOT_FILES,
} from "./repositoryReadPolicy.validator";
import { walkRepository } from "./walkRepository.service";

/** Сохраняет прежний порядок Context Pack; MCP использует тот же owner без entrypoint CP. */
export const collectProjectContext = async (
  workspaceRoot: string,
  options: ProjectContextQuery = {},
): Promise<ProjectContextEntry[]> => {
  const policy = await createRepositoryReadPolicy(workspaceRoot, true);
  const scan = await walkRepository(policy);
  if (scan.truncated)
    throw new Error("Context Pack exceeds the traversal safety limit.");
  const rootOrder = [...REPOSITORY_ROOT_FILES, ...REPOSITORY_ROOT_DIRECTORIES];
  const entries = scan.entries
    .filter((entry) => entry.type === "file")
    .sort((a, b) => {
      const rank =
        rootOrder.indexOf(a.path.split("/")[0]) -
        rootOrder.indexOf(b.path.split("/")[0]);
      return rank || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
    });
  const files: ProjectContextEntry[] = [];
  let totalBytes = 0;
  for (const entry of entries) {
    if (options.limit && files.length >= options.limit) break;
    if (options.query && !entry.path.toLowerCase().includes(options.query))
      continue;
    if (options.paths && !options.paths.has(entry.path)) continue;
    try {
      const file = await readRepositoryFile(policy, entry.path);
      totalBytes += file.bytes.length;
      if (totalBytes > REPOSITORY_MAX_SCAN_BYTES)
        throw new Error("Context Pack exceeds the 50 MiB safety limit.");
      files.push({
        data: file.bytes,
        file: { path: file.path, size: file.bytes.length, sha256: file.sha256 },
      });
    } catch (error) {
      if (
        error instanceof RepositoryReadError &&
        ["FORBIDDEN", "NOT_FOUND", "RESULT_LIMIT"].includes(error.code)
      )
        continue;
      throw error;
    }
  }
  return files;
};
