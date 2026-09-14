/**
 * @file packages/codex-adapter/src/CodexReadTools.types.ts
 * @version 1.0.0
 * @date 2026-09-13
 * @description Определяет привязку и текстовый ответ разрешённого инструмента чтения Codex.
 */

export type CodexReadToolBinding = { threadID: string; turnID: string };

/** Узкая проекция DynamicToolCallResponse; изображения и другие выходы не поддерживаются. */
export type CodexReadToolResponse = {
  success: boolean;
  contentItems: { type: "inputText"; text: string }[];
};
