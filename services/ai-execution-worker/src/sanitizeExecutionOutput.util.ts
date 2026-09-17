/**
 * @file services/ai-execution-worker/src/sanitizeExecutionOutput.util.ts
 * @version 1.0.0
 * @date 2026-09-15
 * @description Удаляет известные секреты и пути workspace до ограничения сохраняемого вывода исполнителя.
 */

/** Summary сохраняет первые 4000 символов, check — последние 8000; raw evidence hash формируется отдельно. */
export function sanitizeExecutionOutput(
  value: string,
  roots: readonly string[],
  kind: "summary" | "check" = "summary",
): string {
  let output = value
    .replace(
      /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----[\s\S]*?(?:-----END (?:[A-Z0-9]+ )*PRIVATE KEY-----|$)/g,
      "[redacted-private-key]",
    )
    .replace(
      /\b([a-z][a-z0-9+.-]*:\/\/)[^\s/?#]*@/gi,
      "$1[redacted-credentials]@",
    )
    .replace(
      /([?&](?:[a-z0-9_.-]*[-_])?(?:access[_-]?token|refresh[_-]?token|id[_-]?token|api[_-]?key|token|secret|password|sig|signature|credential)=)[^\s&#"'<>]+/gi,
      "$1[redacted-token]",
    )
    .replace(
      /(["']?\b(?:[a-z0-9_]*(?:api[_-]?key|token|secret|password|passwd))\b["']?\s*[:=]\s*)("[^"\r\n]*"|'[^'\r\n]*'|[^\s"'&,;}\]]+)/gi,
      (match, label: string, secret: string) =>
        secret.startsWith("[redacted-") ? match : `${label}[redacted-token]`,
    )
    .replace(/\bsk-(?:proj-)?[A-Za-z0-9_-]{12,}\b/g, "[redacted-token]")
    .replace(/\bgh[oprsu]_[A-Za-z0-9]{20,}\b/g, "[redacted-token]")
    .replace(/\bgithub_pat_[A-Za-z0-9_]{20,}\b/g, "[redacted-token]")
    .replace(/\b(?:sk|rk)_live_[A-Za-z0-9]{12,}\b/g, "[redacted-token]")
    .replace(
      /\beyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
      "[redacted-token]",
    )
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9+/_=.-]+/gi, "$1 [redacted-token]");
  // Самый вложенный путь заменяется первым; пустой root не вставляет маркер между всеми символами.
  for (const root of [...new Set(roots)]
    .filter((root) => root.trim())
    .sort((a, b) => b.length - a.length)) {
    output = output.replaceAll(root, "[workspace]");
  }
  return kind === "check" ? output.slice(-8_000) : output.slice(0, 4_000);
}
