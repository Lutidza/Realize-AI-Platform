/**
 * @file packages/git-runtime/src/gitFailureCategory.constants.ts
 * @version 1.0.1
 * @date 2026-10-22
 * @description Задаёт конечный набор безопасных категорий отказа Git.
 */

export const GIT_FAILURE_CATEGORIES = [
  "authentication_failed",
  "permission_denied",
  "email_privacy",
  "branch_protected",
  "non_fast_forward",
  "hook_rejected",
  "remote_guard_denied",
  "repository_unavailable",
  "transport_failure",
  "timeout",
  "output_limit",
  "unknown",
] as const;
