/**
 * @file .ai/tools/quality/MarkdownReference.types.ts
 * @version 1.0.0
 * @date 2026-10-29
 * @description Задаёт исходный target локальной Markdown-ссылки и его UTF-16 диапазон.
 */
export interface MarkdownLinkSpan {
  target: string;
  start: number;
  end: number;
}
