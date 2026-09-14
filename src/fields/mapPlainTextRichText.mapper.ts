/**
 * @file src/fields/mapPlainTextRichText.mapper.ts
 * @version 1.0.0
 * @date 2026-09-13
 * @description Строит Lexical из явных текстовых абзацев и заголовков без HTML или ссылок.
 */
import type { PlainTextRichTextElement } from "./PlainTextRichText.types";

/** Значение text всегда остаётся literal текстовым узлом. */
export const mapPlainTextRichText = (elements: PlainTextRichTextElement[]) => ({
  root: {
    children: elements.map((element) => ({
      children: [
        {
          detail: 0,
          format: 0,
          mode: "normal",
          style: "",
          text: element.text,
          type: "text",
          version: 1,
        },
      ],
      direction: "ltr",
      format: "",
      indent: 0,
      type: element.type,
      version: 1,
      ...(element.type === "heading"
        ? { tag: element.tag }
        : { textFormat: 0, textStyle: "" }),
    })),
    direction: "ltr",
    format: "",
    indent: 0,
    type: "root",
    version: 1,
  },
});
