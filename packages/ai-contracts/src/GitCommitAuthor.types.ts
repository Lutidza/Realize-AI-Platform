/**
 * @file packages/ai-contracts/src/GitCommitAuthor.types.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Задаёт имя и email автора Git-коммита без полномочий на запись.
 */

/** Настройка авторства; разрешение commit передаётся отдельным доверенным контекстом. */
export type GitCommitAuthor = { name: string; email: string };
