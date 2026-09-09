/**
 * @file .ai/tools/source-headers/src/SourceHeaders.types.ts
 * @version 1.0.0
 * @date 2026-09-08
 * @description Задаёт вход, результат и форматы проверки шапок исходников.
 */

export type HeaderCommentStyle = "tsdoc" | "block" | "hash" | "markup";

export type SourceHeadersInput = {
  root: string;
  files: readonly string[];
};

export type SourceHeadersReport = {
  checked: number;
  skipped: { file: string; reason: string }[];
  violations: { file: string; message: string }[];
};
