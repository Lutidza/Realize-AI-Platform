/**
 * @file services/ai-execution-worker/src/SourcePromotionGit.types.ts
 * @version 1.0.0
 * @date 2026-10-22
 * @description Описывает доверенную серверную привязку exact GitHub branch publication.
 */

/** Root, executable и credential поступают только от server configuration и integration resolver. */
export type SourcePromotionGitInput = {
  gitCommand: string;
  gitCommit: string;
  headBranch: string;
  repositoryRoot: string;
  repositorySlug: string;
  timeoutMs: number;
  token: string;
};
