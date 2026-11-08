/**
 * @file .ai/tools/agent-search/src/getModuleFileCandidates.util.d.mts
 * @version 1.0.0
 * @date 2026-10-29
 * @description Объявляет общий контракт кандидатов TS/JS модуля для read и mutation consumers.
 */
export function getModuleFileCandidates(
  path: string,
  suffixes?: readonly string[],
): string[];
