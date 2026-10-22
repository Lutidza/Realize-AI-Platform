/**
 * @file packages/git-runtime/src/GitFailureCategory.types.ts
 * @version 1.0.1
 * @date 2026-10-22
 * @description Определяет безопасную категорию отказа без исходного диагностического текста.
 */

import type { GIT_FAILURE_CATEGORIES } from "./gitFailureCategory.constants.ts";

export type GitFailureCategory = (typeof GIT_FAILURE_CATEGORIES)[number];
