/**
 * @file .ai/tools/git-delivery/src/commit/assertNoGitSecrets.validator.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Проверяет байты на явные секреты без раскрытия совпадений.
 */
import { PolicyError } from "../Policy.error.ts";

export function assertNoGitSecrets(bytes: Buffer): void {
  // Это дополнительный детектор явных секретов, а не доказательство их отсутствия.
  const content = bytes.toString("utf8");
  if (
    /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----|\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|AKIA[0-9A-Z]{16})\b/.test(
      content,
    ) ||
    /https?:\/\/[^\s/@:]+:[^\s/@]+@/i.test(content)
  ) {
    throw new PolicyError(
      "secret_detected",
      "В содержимом обнаружен возможный секрет; требуется проверка.",
    );
  }
}
