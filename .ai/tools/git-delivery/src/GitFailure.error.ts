/**
 * @file .ai/tools/git-delivery/src/GitFailure.error.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Передаёт безопасную причину сбоя Git и код завершения без исходного stderr.
 */

/** exitCode позволяет различать ожидаемое отсутствие ссылки и отказ процесса. */
export class GitFailure extends Error {
  code: string;
  exitCode: number | null;

  constructor(code: string, message: string, exitCode: number | null = null) {
    super(message);
    this.name = "GitFailure";
    this.code = code;
    this.exitCode = exitCode;
  }
}
