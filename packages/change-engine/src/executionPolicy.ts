/**
 * @file packages/change-engine/src/executionPolicy.ts
 * @version 2026-08-21
 * @description Enforces the initial code-lane path, check and worker instruction policy.
 */

const PROTECTED_PATH_PREFIXES = [
  ".ai/",
  ".codex/",
  ".github/",
  "documentation/",
  "packages/",
  "scripts/deploy/",
  "scripts/migrations/",
  "scripts/release/",
  "scripts/security/",
  "services/",
  "src/access/",
  "src/migrations/",
  "src/payload.config.ts",
  "src/plugins/",
] as const;

/** Server-owned command registry; plans cannot introduce arbitrary shell. */
export const EXECUTION_CHECK_COMMANDS = Object.freeze([
  "node scripts/security/check-secrets.mjs",
  "npm run build",
  "npm run format:check",
  "npm run lint",
  "npm run payload:migrate:status",
  "npm run test:e2e",
  "npm run test:int",
  "npm run typecheck",
]);

/** Result of evaluating a plan before issuing workspace-write capability. */
export type ExecutionScopeAssessment =
  { allowed: true } | { allowed: false; reason: string };

const normalizePath = (value: string): string =>
  value.replaceAll("\\", "/").replace(/^\.\//, "");

/** Returns true when a changed path belongs to one exact approved scope. */
export const pathMatchesExecutionScope = (
  path: string,
  allowedPaths: string[],
): boolean => {
  const candidate = normalizePath(path);
  return allowedPaths.some((rawScope) => {
    const scope = normalizePath(rawScope);
    if (scope.endsWith("/**")) return candidate.startsWith(scope.slice(0, -2));
    if (scope.endsWith("/")) return candidate.startsWith(scope);
    return candidate === scope;
  });
};

/** Fails closed for malformed, protected or non-allowlisted code-lane scope. */
export const assessExecutionScope = (input: {
  affectedPaths: string[];
  checks: string[];
  type: string;
}): ExecutionScopeAssessment => {
  if (!new Set(["CODE_CHANGE", "THEME_CHANGE"]).has(input.type)) {
    return {
      allowed: false,
      reason: "Первый execution slice поддерживает только code/theme changes.",
    };
  }
  if (input.affectedPaths.length === 0 || input.affectedPaths.length > 100) {
    return {
      allowed: false,
      reason: "Scope должен содержать от 1 до 100 путей.",
    };
  }

  for (const rawPath of input.affectedPaths) {
    const path = normalizePath(rawPath);
    if (
      !path ||
      path.startsWith("/") ||
      path.includes("\0") ||
      path.split("/").includes("..")
    ) {
      return { allowed: false, reason: `Некорректный путь scope: ${rawPath}` };
    }
    if (
      PROTECTED_PATH_PREFIXES.some(
        (prefix) =>
          path === prefix.replace(/\/$/, "") || path.startsWith(prefix),
      )
    ) {
      return {
        allowed: false,
        reason: `Защищённый owner-layer требует отдельного engineering flow: ${path}`,
      };
    }
  }

  const registry = new Set<string>(EXECUTION_CHECK_COMMANDS);
  const forbiddenCheck = input.checks.find((check) => !registry.has(check));
  if (forbiddenCheck) {
    return {
      allowed: false,
      reason: `Проверка отсутствует в server allowlist: ${forbiddenCheck}`,
    };
  }
  return { allowed: true };
};

/** Builds strict instructions for a non-interactive isolated implementation turn. */
export const buildCodeExecutionDeveloperInstructions = (input: {
  affectedPaths: string[];
  baseCommit: string;
  changeRequestID: string;
  checks: string[];
}): string =>
  [
    "You are the isolated Realize E-Commerce implementation worker.",
    "Implement the approved plan in the supplied Git worktree and stop after editing files.",
    "Answer in Russian unless the approved request explicitly requires another language.",
    `Change Request: ${input.changeRequestID}. Base commit: ${input.baseCommit}.`,
    `Writable scope (exact files or explicit directory scopes): ${JSON.stringify(input.affectedPaths)}.`,
    `Checks owned by the orchestrator after your turn: ${JSON.stringify(input.checks)}.`,
    "Never edit a path outside the writable scope, even for formatting or generated artifacts.",
    "Never access MCP, web/network services, credentials, environment files, databases, Git remotes, or other worktrees.",
    "Do not install packages, change dependencies, commit, push, deploy, run migrations, or start long-lived services.",
    "Follow AGENTS.md and the active .ai/.codex instructions already present in this worktree.",
    "If the approved scope is insufficient, make no out-of-scope change and report the blocker.",
    "End with a concise summary of modified paths and unresolved blockers.",
  ].join("\n");
