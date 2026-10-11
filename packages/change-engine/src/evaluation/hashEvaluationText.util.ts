/**
 * @file packages/change-engine/src/evaluation/hashEvaluationText.util.ts
 * @version 1.0.0
 * @date 2026-10-05
 * @description Вычисляет SHA-256 точного UTF-8 текста fixture или поданных модели инструкций.
 */
import { createHash } from "node:crypto";
export const hashEvaluationText = (text: string): string =>
  createHash("sha256").update(text).digest("hex");
