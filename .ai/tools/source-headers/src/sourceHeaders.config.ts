/**
 * @file .ai/tools/source-headers/src/sourceHeaders.config.ts
 * @version 1.4.0
 * @date 2026-10-12
 * @description Описывает поддерживаемые форматы и подтверждённые исключения проверки шапок.
 */

import type { HeaderCommentStyle } from "./SourceHeaders.types.ts";

export const sourceHeaderStyles: Readonly<Record<string, HeaderCommentStyle>> =
  {
    ".ts": "tsdoc",
    ".tsx": "tsdoc",
    ".mts": "tsdoc",
    ".cts": "tsdoc",
    ".js": "tsdoc",
    ".jsx": "tsdoc",
    ".mjs": "tsdoc",
    ".cjs": "tsdoc",
    ".css": "block",
    ".scss": "block",
    ".jsonc": "block",
    ".sh": "hash",
    ".bash": "hash",
    ".py": "hash",
    ".rb": "hash",
    ".yaml": "hash",
    ".yml": "hash",
    ".toml": "hash",
    ".conf": "hash",
    ".html": "markup",
    ".xml": "markup",
    ".svg": "markup",
  };

// Точные пути: соседние собственные файлы Payload и рукописные .d.ts не исключаются.
export const generatedHeaderExceptions: Readonly<Record<string, string>> = {
  "src/migrations/index.ts":
    "Payload migrate:create; автоматически создаваемый migration registry",
  "src/migrations/20261011_162630_task_manager_foundation.ts":
    "Payload migrate:create --file scripts/migrations/task-manager.mjs; источник — schema и template",
  "src/migrations/20261011_215235_task_git_sync.ts":
    "Payload migrate:create --file scripts/migrations/task-git-sync.mjs; источник — schema и template",
  "src/migrations/20261004_210727_ai_usage_ledger.ts":
    "Payload migrate:create --file scripts/migrations/ai-usage-ledger.mjs; источник — schema и template",
  "src/migrations/20261004_161914_ai_execution_context.ts":
    "Payload migrate:create --file scripts/migrations/ai-execution-context.mjs; источник — schema и template",
  "src/payload-types.ts":
    "Payload generate:types; outputFile в src/payload.config.ts",
  "src/app/(payload)/admin/importMap.js":
    "Payload generate:importmap; package.json",
  "next-env.d.ts": "Next; указание should not be edited в файле",
  "src/app/(payload)/layout.tsx":
    "Шаблон Payload; GENERATED AUTOMATICALLY BY PAYLOAD в файле",
  "src/app/(payload)/admin/[[...segments]]/page.tsx":
    "Шаблон Payload; GENERATED AUTOMATICALLY BY PAYLOAD в файле",
  "src/app/(payload)/admin/[[...segments]]/not-found.tsx":
    "Шаблон Payload; GENERATED AUTOMATICALLY BY PAYLOAD в файле",
  "src/app/(payload)/api/[...slug]/route.ts":
    "Шаблон Payload; GENERATED AUTOMATICALLY BY PAYLOAD в файле",
  "src/app/(payload)/api/graphql/route.ts":
    "Шаблон Payload; GENERATED AUTOMATICALLY BY PAYLOAD в файле",
  "src/app/(payload)/api/graphql-playground/route.ts":
    "Шаблон Payload; GENERATED AUTOMATICALLY BY PAYLOAD в файле",
};

export const generatedHeaderDirectories: readonly string[] = [
  ".next/",
  ".ai/tools/agent-monitor/dist/",
];

export const nonSourceHeaderExtensions = new Set([
  ".json",
  ".jsonl",
  ".md",
  ".csv",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".avif",
  ".ico",
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
  ".pdf",
  ".zip",
  ".gz",
  ".mp3",
  ".mp4",
  ".webm",
  ".wav",
  ".bin",
  ".wasm",
  ".sqlite",
  ".sqlite3",
]);
