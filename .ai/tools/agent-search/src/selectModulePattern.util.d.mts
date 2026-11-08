/**
 * @file .ai/tools/agent-search/src/selectModulePattern.util.d.mts
 * @version 1.0.0
 * @date 2026-10-29
 * @description Типизирует общий выбор exact/wildcard mapping для TypeScript consumers.
 * @see documentation/architecture/repository-search.md
 */
export function selectModulePattern<T>(
  map: Record<string, T>,
  value: string,
  preferSuffix?: boolean,
): { pattern: string; value: T; capture: string } | undefined;
