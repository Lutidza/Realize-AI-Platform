/**
 * @file .ai/tools/git-delivery/src/commit/hashGitCommitContext.util.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Сохраняет legacy-привязку операции при обновлении проверенного снимка.
 */
import { createHash } from "node:crypto";
import type { Command, Context } from "../GitDelivery.types.ts";
const hash = (value: unknown): string =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function hashGitCommitContext(
  command: Command,
  context: Context,
): string {
  const { recovery: _recovery, ...originalContext } = context;
  return hash({
    command,
    ...originalContext,
    verification: context.verification && {
      inputPaths: context.verification.inputPaths,
      requiredChecks: context.verification.requiredChecks,
    },
  });
}
