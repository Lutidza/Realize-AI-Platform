/**
 * @file packages/engineering-runtime/src/contracts/engineeringBounds.constants.ts
 * @version 1.0.0
 * @date 2026-10-26
 * @description Задаёт ограниченный профиль входов инженерного протокола первой реализации.
 * @see documentation/architecture/engineering-operations.md
 */

/** Пределы входа; увеличение требует новой host policy, а не поля команды. */
export const ENGINEERING_BOUNDS = Object.freeze({
  commandBytes: 128 * 1024,
  actions: 64,
  taskRefs: 64,
  contentBytes: 8 * 1024 * 1024,
  pathBytes: 1024,
  pathSegmentBytes: 255,
  pathDepth: 32,
  reasonBytes: 2048,
  cursorBytes: 2048,
  defaultPageItems: 100,
  maxPageItems: 500,
  paramsBytes: 32 * 1024,
  paramsDepth: 16,
  paramsNodes: 2048,
  paramsStringBytes: 8192,
  paramsArrayItems: 256,
  paramsObjectKeys: 128,
});

/** Canonical JSON имеет собственную версию, независимую от legacy hashes. */
export const ENGINEERING_NORMALIZATION_VERSION = 1;
