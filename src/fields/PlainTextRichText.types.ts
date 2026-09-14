/**
 * @file src/fields/PlainTextRichText.types.ts
 * @version 1.0.0
 * @date 2026-09-13
 * @description Задаёт текстовые элементы для построения ограниченного Lexical документа.
 */
export type PlainTextRichTextElement =
  | { type: "paragraph"; text: string }
  | { type: "heading"; text: string; tag: "h1" | "h2" };
