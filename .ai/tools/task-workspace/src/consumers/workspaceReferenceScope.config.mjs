/**
 * @file .ai/tools/task-workspace/src/consumers/workspaceReferenceScope.config.mjs
 * @version 1.0.1
 * @date 2026-10-15
 * @description Задаёт область, исключения и бюджеты ограниченного поиска ссылок на артефакты.
 * @see documentation/specifications/task-management-execution.md
 */
/** Область обхода исходников и соседних TASK.md; содержимое их артефактов не включается. */
export const workspaceReferenceScope = {
  roots: [
    "src",
    "packages",
    "services",
    "scripts",
    "tests",
    ".ai/rules",
    ".ai/checks",
    ".ai/workflows",
    ".ai/tools",
    ".codex",
    "documentation",
    "README.md",
    "AGENTS.md",
    "package.json",
    "tsconfig.json",
    "next-env.d.ts",
    "next.config.ts",
    "playwright.config.ts",
  ],
  skippedNames: new Set(["node_modules", ".git", ".next"]),
  skippedPaths: [
    /^\.ai\/tools\/[^/]+\/runtime(?:\/|$)/,
    /^documentation\/(?:reports|temp)(?:\/|$)/,
  ],
  protectedNames: [/^\.env/, /^(?:credentials|auth)\.json$/],
  supportedExtensions: /\.(?:ts|tsx|js|mjs|cjs|json|md|ya?ml|toml)$/,
  dossierRoots: [".ai-workspace/tasks", ".ai-workspace/history"],
  maxFiles: 15000,
  maxDossiers: 2048,
  maxBytes: 2 * 1024 * 1024,
};
