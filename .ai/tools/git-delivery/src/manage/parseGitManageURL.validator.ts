/**
 * @file .ai/tools/git-delivery/src/manage/parseGitManageURL.validator.ts
 * @version 1.0.1
 * @date 2026-10-22
 * @description Допускает только GitHub URL без секретов и сохраняет границы переименования repository.
 */
import { PolicyError } from "@realize/git-runtime";

/** Проверяет URL без credentials, query, port, альтернативных host и транспорта. */
export function parseGitManageURL(value: unknown) {
  if (typeof value !== "string" || value.length > 512)
    throw new PolicyError("manage_url_invalid", "Нужен безопасный GitHub URL.");
  const match =
    /^(https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([A-Za-z0-9][A-Za-z0-9-]{0,38})\/([A-Za-z0-9][A-Za-z0-9_.-]{0,99}?)(?:\.git)?$/.exec(
      value,
    );
  if (!match || match[3] === "." || match[3] === "..")
    throw new PolicyError("manage_url_invalid", "Нужен безопасный GitHub URL.");
  return {
    url: value,
    transport: match[1],
    owner: match[2],
    repository: match[3],
  };
}

export function assertGitManageRename(before: string, after: string): void {
  const current = parseGitManageURL(before);
  const next = parseGitManageURL(after);
  if (current.transport !== next.transport || current.owner !== next.owner)
    throw new PolicyError(
      "manage_url_scope_invalid",
      "Переименование сохраняет GitHub owner и транспорт.",
    );
}
