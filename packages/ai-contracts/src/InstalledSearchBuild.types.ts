/**
 * @file packages/ai-contracts/src/InstalledSearchBuild.types.ts
 * @version 1.0.0
 * @date 2026-09-30
 * @description Определяет безопасный optional DTO фактической web-сборки без путей, credentials и данных БД.
 * @see documentation/architecture/repository-search.md
 */
export type InstalledSearchBuildDTO = {
  schemaVersion: "1.0";
  sourceVersion: string;
  installedBuildID: string;
  builtAt: string;
};
