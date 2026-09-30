/**
 * @file .ai/tools/agent-search/src/syntaxSearch.config.mjs
 * @version 1.0.0
 * @date 2026-09-28
 * @description Ограничивает вход чистого parser и явно учитывает покрытие TS/JS.
 */
export const SYNTAX_MAX_FILE_BYTES = 512 * 1024;
export const isSyntaxSearchFile = (path) =>
  /\.(?:[cm]?[jt]s|[jt]sx)$/iu.test(path);
export const createNavigationCoverage = () => ({
  precision: /** @type {const} */ ("syntax"),
  languages: /** @type {const} */ ("typescript_javascript"),
  parsedFiles: 0,
  prefilteredFiles: 0,
  unsupportedFiles: 0,
  skippedFiles: 0,
  syntaxErrorFiles: 0,
  maxFileBytes: /** @type {524288} */ (SYNTAX_MAX_FILE_BYTES),
});
