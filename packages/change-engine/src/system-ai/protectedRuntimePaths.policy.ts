/**
 * @file packages/change-engine/src/system-ai/protectedRuntimePaths.policy.ts
 * @version 1.1.0
 * @date 2026-11-27
 * @description Проверяет канонический путь и защищённые ресурсы независимо от prompt.
 */
import { SYSTEM_AI_RELEASE } from "./systemAIRelease.registry";

export const isSafeRuntimePath = (path: string, scope = false): boolean => {
  const value =
    scope && path.endsWith("/**")
      ? path.slice(0, -3)
      : scope && path.endsWith("/")
        ? path.slice(0, -1)
        : path;
  return (
    value.length > 0 &&
    value.length <= 240 &&
    !/[\\\x00-\x1f\x7f:*?#%]/.test(value) &&
    value
      .split("/")
      .every((part) => part !== "" && part !== "." && part !== "..")
  );
};

function protectedPath(path: string, exceptPrefix?: "packages/"): boolean {
  const candidate = path.toLowerCase();
  const parts = candidate.split("/");
  if (
    parts.some(
      (part) =>
        [".ai", ".codex", ".agents", ".git", ".github"].includes(part) ||
        SYSTEM_AI_RELEASE.execution.protectedNames.some(
          (name) => part === name.toLowerCase(),
        ) ||
        part.startsWith(".env.") ||
        /\.(?:pem|key|p12|pfx)$/.test(part) ||
        ["id_rsa", "id_ed25519", "credentials.json", "auth.json"].includes(
          part,
        ),
    )
  )
    return true;
  return SYSTEM_AI_RELEASE.execution.protectedPrefixes.some(
    (prefix) =>
      prefix !== exceptPrefix &&
      (candidate === prefix.toLowerCase().replace(/\/$/, "") ||
        candidate.startsWith(prefix.toLowerCase())),
  );
}

export const isProtectedRuntimePath = (path: string): boolean =>
  protectedPath(path);

/** Выделяет возможного владельца файла. Принадлежность шаблону подтверждает потребитель по Git revision. */
export function templatePackageCandidate(path: string): string | undefined {
  const [packages, owner, file] = path.split("/");
  if (
    packages === "packages" &&
    owner &&
    file &&
    isSafeRuntimePath(path) &&
    !/[\[\]{}]/u.test(path) &&
    !protectedPath(path, "packages/")
  )
    return packages + "/" + owner;
}

/** Directory scope не может включать известный защищённый owner; отдельные имена проверяются и в diff. */
export const overlapsProtectedRuntimeScope = (scope: string): boolean => {
  if (isProtectedRuntimePath(scope)) return true;
  const prefix = scope.endsWith("/**")
    ? scope.slice(0, -2)
    : scope.endsWith("/")
      ? scope
      : undefined;
  return Boolean(
    prefix &&
    SYSTEM_AI_RELEASE.execution.protectedPrefixes.some((path) =>
      path.toLowerCase().startsWith(prefix.toLowerCase()),
    ),
  );
};
