/**
 * @file .ai/tools/git-delivery/src/commit/verifyGitCommitEvidence.validator.ts
 * @version 1.0.1
 * @date 2026-10-22
 * @description Связывает обязательные проверки с одним проверенным снимком commit.
 */
import { PolicyError } from "@realize/git-runtime";
import type { Context, Result } from "../GitDelivery.types.ts";

export function verifyEvidence(
  context: Context,
  fingerprint: string,
  result: Result,
): void {
  result.checks = [];
  const verification = context.verification;
  if (!verification?.requiredChecks.length)
    throw new PolicyError(
      "checks_required",
      "Нужны выполненные проверки из доверенного контекста.",
    );
  for (const id of verification.requiredChecks) {
    const check = verification.results.find((item) => item.id === id);
    if (
      !check ||
      check.status !== "passed" ||
      check.fingerprint !== fingerprint
    ) {
      throw new PolicyError(
        "checks_stale_or_missing",
        "Обязательная проверка отсутствует, не пройдена или относится к другому снимку.",
      );
    }
    result.checks.push({ id, status: "passed", reused: true });
  }
}
