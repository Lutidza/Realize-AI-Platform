/**
 * @file .ai/tools/git-delivery/src/GitFailureCategory.types.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Определяет безопасную категорию отказа без исходного диагностического текста.
 */

import type { GIT_FAILURE_CATEGORIES } from "./gitFailureCategory.constants.ts";

export type GitFailureCategory = (typeof GIT_FAILURE_CATEGORIES)[number];
