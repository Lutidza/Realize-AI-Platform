/**
 * @file packages/change-engine/src/extractChangePlanPaths.util.ts
 * @version 2.0.0
 * @date 2026-09-15
 * @description Проецирует только явные файлы валидного code-plan block в область записи.
 */

import { parseCodePlan } from "./parseCodePlan.validator";

/** Read citations и обычная проза не дают scope; любой дефект блока закрывает весь список. */
export const extractChangePlanPaths = (plan: string): string[] =>
  parseCodePlan(plan)
    ?.files.map((file) => file.path)
    .sort() ?? [];
