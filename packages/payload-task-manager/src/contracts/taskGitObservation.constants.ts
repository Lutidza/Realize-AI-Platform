/**
 * @file packages/payload-task-manager/src/contracts/taskGitObservation.constants.ts
 * @version 1.1.0
 * @date 2026-10-12
 * @description Ограничивает размер live-снимка Git и одной страницы PR в публичном контракте.
 * @see documentation/specifications/task-management-execution.md
 */
export const TASK_GIT_OBSERVATION_LIMIT = 8;
export const TASK_GIT_OBSERVATION_PULL_REQUEST_LIMIT = 20;
export const TASK_GIT_OBSERVATION_CI_LIMIT = 20;
