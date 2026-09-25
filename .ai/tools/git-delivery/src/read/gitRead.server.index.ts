/**
 * @file .ai/tools/git-delivery/src/read/gitRead.server.index.ts
 * @version 1.1.0
 * @date 2026-09-24
 * @description Экспортирует ограниченные серверные операции status, diff и проверку Git metadata.
 * @see documentation/architecture/decisions/ADR-0017-internal-mcp-and-server-management.md
 */
export { readGitStatus } from "./readGitStatus.service";
export { probeGitRead } from "./readGitMetadata.adapter";
export { readGitDiff } from "./readGitDiff.service";
export type { GitReadContext } from "./GitRead.types";
