/**
 * @file packages/verification-runtime/src/redactVerificationOutput.util.ts
 * @version 1.1.0
 * @date 2026-10-22
 * @description Удаляет явные секреты и credential patterns до сохранения bounded диагностических строк.
 */
export function redactVerificationOutput(
  raw: string,
  secrets: readonly string[],
): string {
  let output = raw;
  for (const value of [
    ...new Set(
      secrets
        .flatMap((secret) => [secret, ...secret.split(/\r?\n/u)])
        .filter(Boolean),
    ),
  ].sort((a, b) => b.length - a.length))
    output = output.split(value).join("[redacted]");
  return output
    .replace(
      /-----BEGIN [^-]*(?:PRIVATE KEY|SECRET)[^-]*-----[\s\S]*?(?:-----END [^-]+-----|$)/gu,
      "[redacted private material]",
    )
    .replace(
      /\b(?:Bearer|Basic)\s+[A-Za-z0-9+/_=.~-]+/giu,
      "[redacted authorization]",
    )
    .replace(
      /([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+(?::[^\s/@]*)?@/giu,
      "$1[redacted]@",
    )
    .replace(
      /\b(?:gh[pousr]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+|sk-[A-Za-z0-9_-]{8,}|AKIA[A-Z0-9]{12,})\b/gu,
      "[redacted token]",
    )
    .replace(
      /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/gu,
      "[redacted token]",
    )
    .replace(
      /(["']?(?:password|passwd|token|secret|api[_-]?key|authorization)["']?\s*[=:]\s*)(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s,;]+)/giu,
      "$1[redacted]",
    )
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu, "");
}
