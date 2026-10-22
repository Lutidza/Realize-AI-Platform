/**
 * @file packages/git-runtime/src/GitFailure.error.ts
 * @version 1.1.1
 * @date 2026-10-22
 * @description Передаёт безопасную причину сбоя Git и код завершения без исходного stderr.
 */

import type { GitFailureCategory } from "./GitFailureCategory.types.ts";

/** exitCode сохраняет статус процесса, category передаёт только конечную причину без stderr. */
export class GitFailure extends Error {
  code: string;
  exitCode: number | null;
  readonly category: GitFailureCategory;

  constructor(
    code: string,
    message: string,
    exitCode: number | null = null,
    category: GitFailureCategory = "unknown",
  ) {
    super(message);
    this.name = "GitFailure";
    this.code = code;
    this.exitCode = exitCode;
    this.category = category;
  }
}
