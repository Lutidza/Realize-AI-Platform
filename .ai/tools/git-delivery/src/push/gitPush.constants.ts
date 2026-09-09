/**
 * @file .ai/tools/git-delivery/src/push/gitPush.constants.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Задаёт допустимые этапы диагностики и предел явно разрешённых повторов push.
 */

export const GIT_PUSH_STAGES = [
  "context",
  "source",
  "journal",
  "connection",
  "remote",
  "prepare",
  "push",
  "confirm",
  "cleanup",
] as const;

export const MAX_GIT_PUSH_RECOVERY_ATTEMPTS = 16;
