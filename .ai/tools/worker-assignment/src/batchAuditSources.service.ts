/**
 * @file .ai/tools/worker-assignment/src/batchAuditSources.service.ts
 * @version 1.0.0
 * @date 2026-11-26
 * @description Разбивает доступные источники аудита на группы закреплённых диапазонов.
 * @see documentation/specifications/internal-mcp.md
 */
import {
  readRepositoryFile,
  type RepositoryReadPolicy,
} from "realize-ai-platform/repository-read-policy";
import type { IdeAuditRange } from "realize-ai-platform/ide-assignment-queue";
import { planAuditRanges } from "./auditRanges.service";
const batchBytes = 112 * 1024;

export async function batchAuditSources(
  policy: RepositoryReadPolicy,
  paths: string[],
  gaps: string[],
  signal: AbortSignal,
) {
  const groups: IdeAuditRange[][] = [];
  let group: IdeAuditRange[] = [],
    size = 0;
  for (const path of paths) {
    signal.throwIfAborted();
    try {
      const file = await readRepositoryFile(policy, path, { signal });
      for (const range of planAuditRanges(
        path,
        file.text,
        file.sha256,
        batchBytes,
      )) {
        if (
          group.length &&
          (size + range.byteLength > batchBytes ||
            group.some((r) => r.path === path) ||
            group.length >= 8)
        ) {
          groups.push(group);
          group = [];
          size = 0;
        }
        group.push(range);
        size += range.byteLength;
      }
    } catch (error) {
      signal.throwIfAborted();
      gaps.push(path + " " + String(error));
    }
  }
  if (group.length) groups.push(group);
  return groups;
}
