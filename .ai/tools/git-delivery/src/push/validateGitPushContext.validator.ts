/**
 * @file .ai/tools/git-delivery/src/push/validateGitPushContext.validator.ts
 * @version 1.1.2
 * @date 2026-10-22
 * @description Проверяет немодельное разрешение push и полноту evidence разрешённых коммитов.
 */
import { PolicyError } from "@realize/git-runtime";
import { parseGitPushContext } from "./parseGitPushContext.validator.ts";
import type { GitPushContext } from "./GitPush.types.ts";

/** Полная проверка остаётся обязательной перед моделью и внутри push handler. */
export function validateGitPushContext(input: unknown): GitPushContext {
  const context = parseGitPushContext(input);
  const { requiredChecks, results } = context.verification;
  const { commits } = context.authorization.scope;
  const passed = new Set(
    results
      .filter((result) => result.status === "passed")
      .map((result) => `${result.id}:${result.commit}`),
  );
  if (
    results.length !== commits.length * requiredChecks.length ||
    passed.size !== results.length ||
    commits.some((commit) =>
      requiredChecks.some((id) => !passed.has(`${id}:${commit}`)),
    )
  ) {
    throw new PolicyError(
      "checks_stale_or_missing",
      "Не все разрешённые коммиты имеют успешные проверки.",
    );
  }
  return context;
}
