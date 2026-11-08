/**
 * @file .ai/tools/agent-search/src/syntaxSearch.config.d.mts
 * @version 1.0.0
 * @date 2026-10-30
 * @description Объявляет существующую классификацию TS/JS и parser coverage без дублирования реализации.
 * @see documentation/architecture/repository-search.md
 */
export const SYNTAX_MAX_FILE_BYTES: 524288;
export function isSyntaxSearchFile(path: string): boolean;
export function createNavigationCoverage(): {
  precision: "syntax";
  languages: "typescript_javascript";
  parsedFiles: number;
  prefilteredFiles: number;
  unsupportedFiles: number;
  skippedFiles: number;
  syntaxErrorFiles: number;
  maxFileBytes: typeof SYNTAX_MAX_FILE_BYTES;
};
