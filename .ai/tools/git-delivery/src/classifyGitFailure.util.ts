/**
 * @file .ai/tools/git-delivery/src/classifyGitFailure.util.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Сопоставляет stderr Git с конечной категорией без выдачи исходных данных.
 */

import type { GitFailureCategory } from "./GitFailureCategory.types.ts";

/** Категория служит подсказкой; незнакомый или локализованный stderr остаётся unknown. */
export function classifyGitFailure(stderr: string): GitFailureCategory {
  if (typeof stderr !== "string") return "unknown";
  const diagnostic = stderr.toLowerCase();

  // Специальный отказ локального guard и серверные политики важнее общей ошибки hook.
  if (/\bgit_remote_guard_denied\b/u.test(diagnostic)) {
    return "remote_guard_denied";
  }
  if (
    /\bgh007\b|push would publish a private email address/u.test(diagnostic)
  ) {
    return "email_privacy";
  }
  if (
    /\bgh006\b|\bgh013\b|protected branch|branch protection|repository rule violations|branch policy/u.test(
      diagnostic,
    )
  ) {
    return "branch_protected";
  }
  if (
    /authentication failed|authentication denied|invalid (?:username|password|credentials|token)|http basic: access denied|could not read (?:username|password)|permission denied \([^\r\n)]*(?:publickey|password|keyboard-interactive)|no supported authentication methods|requested url returned error: 401/u.test(
      diagnostic,
    )
  ) {
    return "authentication_failed";
  }
  if (
    /permission (?:to [^\r\n]* )?denied|write access [^\r\n]*not granted|not allowed to push|access denied|requested url returned error: 403/u.test(
      diagnostic,
    )
  ) {
    return "permission_denied";
  }
  if (
    /non-fast-forward|\(fetch first\)|tip of your current branch is behind/u.test(
      diagnostic,
    )
  ) {
    return "non_fast_forward";
  }
  if (
    /(?:pre-receive|pre-push|update) hook (?:declined|rejected|failed)|hook declined|hook rejected/u.test(
      diagnostic,
    )
  ) {
    return "hook_rejected";
  }
  if (/timed out|timeout was reached/u.test(diagnostic)) return "timeout";
  if (
    /could not resolve (?:host|hostname)|failed to connect|connection (?:refused|reset|closed)|network is unreachable|no route to host|ssl certificate problem|certificate verification failed|host key verification failed|rpc failed|tls connection|early eof|remote end hung up/u.test(
      diagnostic,
    )
  ) {
    return "transport_failure";
  }
  if (
    /repository [^\r\n]*not found|does not appear to be a git repository|could not read from remote repository|requested url returned error: 404/u.test(
      diagnostic,
    )
  ) {
    return "repository_unavailable";
  }
  return "unknown";
}
