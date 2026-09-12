/**
 * @file packages/change-engine/src/extractChangePlanPaths.util.ts
 * @version 1.0.1
 * @date 2026-09-11
 * @description Извлекает ограниченный список путей проекта из текста и Markdown ссылок.
 */

const PROJECT_PATH =
  /(?:^|[\s(`'"\[])(?:\.\/)?((?:\.ai|\.codex|documentation|packages|scripts|services|src|tests)\/[A-Za-z0-9@_./()[\]-]+)/gm;

// Явные файлы корня распознаются отдельно от каталогов; .env и произвольные имена не допускаются.
const ROOT_FILES = [
  "README.md",
  "AGENTS.md",
  "Dockerfile",
  "package.json",
  "package-lock.json",
  "next.config.ts",
  "tsconfig.json",
  "eslint.config.mjs",
  "postcss.config.js",
  "tailwind.config.mjs",
  "components.json",
  "playwright.config.ts",
  "vitest.config.mts",
  "vitest.setup.ts",
  "redirects.ts",
  "compose.yaml",
  "compose.release-preview.yaml",
  ".dockerignore",
  ".gitignore",
  ".node-version",
  ".nvmrc",
  ".prettierignore",
];
const ROOT_FILE = new RegExp(
  "(?:^|[\\s(`'\"\\[])(?:\\./)?(" +
    ROOT_FILES.map((path) => path.replaceAll(".", "\\.")).join("|") +
    ")(?=$|[\\s`'\"\\]\\[),:;!?]|\\.(?=\\s|$))",
  "gm",
);

const cleanPath = (value: string): string => {
  // Граница подписи ссылки не является частью пути, включая ссылки в /tmp workspace.
  let path = value.split(/\]\(|\]\[/, 1)[0]!.replace(/[.,:;!?]+$/g, "");
  // Удаляем внешнее Markdown/пунктуационное закрытие, сохраняя (app) и [slug].
  while (path.endsWith(")") || path.endsWith("]")) {
    const closing = path.at(-1)!;
    const opening = closing === ")" ? "(" : "[";
    const balance = [...path].reduce(
      (count, char) =>
        count + Number(char === opening) - Number(char === closing),
      0,
    );
    if (balance >= 0) break;
    path = path.slice(0, -1);
  }
  return path;
};

/** Не включает абсолютные URL/workspace пути и исключает выход из корня проекта. */
export const extractChangePlanPaths = (plan: string): string[] => {
  const paths = [
    ...plan.matchAll(PROJECT_PATH),
    ...plan.matchAll(ROOT_FILE),
  ].map((match) => cleanPath(match[1]!));
  return [
    ...new Set(
      paths.filter(
        (path) =>
          path.length > 2 &&
          path.length <= 240 &&
          !path.includes("..") &&
          !path.startsWith("/"),
      ),
    ),
  ]
    .sort()
    .slice(0, 100);
};
