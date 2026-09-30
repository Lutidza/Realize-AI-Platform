/**
 * @file .ai/tools/agent-search/src/searchProfiles.config.mjs
 * @version 1.1.0
 * @date 2026-09-27
 * @description Описывает области поиска, исключения и пределы выдачи agent-search.
 */

const codePaths = ["src", "packages", "services", "tests", "scripts"];
const docsPaths = ["documentation", "README.md", "AGENTS.md"];

export const searchProfiles = {
  code: {
    paths: codePaths,
    description: "Действующий код приложения и инструментов",
  },
  docs: {
    paths: docsPaths,
    extensions: ["md"],
    description: "Действующая документация",
  },
  "code-docs": {
    paths: [...codePaths, ...docsPaths],
    description: "Код и документация",
  },
  "ai-active": {
    paths: [
      ".ai/rules",
      ".ai/checks",
      ".ai/workflows",
      ".ai/roles",
      ".ai/registry",
      ".codex/skills",
      ".codex/agents",
      ".codex/prompts",
    ],
    description: "Действующие инструкции и адаптеры агентов",
  },
  ai: {
    paths: [".ai"],
    description: "Рабочий AI-слой без истории и runtime state",
  },
  codex: { paths: [".codex"], description: "Адаптеры Codex" },
  "next-routes": {
    paths: ["src/app"],
    description: "Действующие маршруты Next.js",
  },
  payload: {
    paths: [
      "src/payload.config.ts",
      "src/collections",
      "src/globals",
      "src/blocks",
      "src/migrations",
      "packages/payload-ai-plugin/src",
    ],
    description: "Payload schema и plugin",
  },
  ui: {
    paths: [
      "src/app",
      "src/components",
      "src/providers",
      "src/blocks",
      "packages/ui-kit/src",
      "packages/payload-ai-plugin/src/admin",
    ],
    description: "Storefront, общий UI и Admin",
  },
  migrations: { paths: ["src/migrations"], description: "Миграции Payload" },
  domain: {
    paths: ["src/RealizeCore"],
    legacy: true,
    reasonRequired: true,
    description: "Quarantined RealizeCore; требуется --reason",
  },
  "search-layer": {
    paths: [
      "src/RealizeCore/services/search",
      "src/RealizeCore/data/searchProfiles",
      "src/RealizeCore/collections/Search",
    ],
    legacy: true,
    reasonRequired: true,
    description: "Quarantined поиск; требуется --reason",
  },
  reference: {
    paths: [],
    explicit: true,
    reasonRequired: true,
    description: "Адресные референсы; нужны --path и --reason",
  },
  special: {
    paths: [],
    explicit: true,
    reasonRequired: true,
    description: "Адресная область; нужны --path и --reason",
  },
};

export const searchExclusions = {
  always: [
    "**/.git/**",
    "**/node_modules/**",
    "**/.next/**",
    "**/dist/**",
    "**/build/**",
    "**/coverage/**",
    "**/.postgres/**",
    "**/.runtime/**",
    "**/.data/**",
    "**/.release/**",
    "**/out-tsc/**",
    "**/test-results/**",
    "**/playwright-report/**",
    "**/.env*",
    "**/id_rsa*",
    "**/id_ed25519*",
    "**/*.{pem,key,p12,pfx,sqlite,sqlite3,db,jsonl,dump,backup}",
    "**/*.{png,jpg,jpeg,gif,webp,avif,ico,pdf,zip,tar,gz,7z,mp3,mp4,webm,woff,woff2,ttf,wasm}",
    "**/*.tsbuildinfo",
    "**/*.map",
  ],
  ordinary: [
    "documentation/reports/**",
    "documentation/temp/**",
    ".ai/agents-evolution/**",
    ".ai/research/**",
    ".ai-workspace/**",
    ".ai/tools/agent-runtime/runtime/**",
    ".ai/tools/agent-search/runtime/**",
    "src/payload-types.ts",
    "src/payload-generated-schema.ts",
    "src/app/(payload)/admin/importMap.js",
    "**/*.log",
  ],
  quarantine: [
    "src/RealizeCore/**",
    "src/app/_realize/**",
    "src/app/(reference)/**",
  ],
  locks: [
    "**/package-lock.json",
    "**/npm-shrinkwrap.json",
    "**/yarn.lock",
    "**/pnpm-lock.yaml",
    "**/bun.lock",
    "**/bun.lockb",
  ],
};

export const SEARCH_LIMITS = {
  results: { default: 40, max: 500 },
  bytes: { default: 8192, min: 512, max: 65536 },
  timeoutMs: { default: 10000, max: 60000 },
  previewCharacters: 240,
  frameBytes: 1024 * 1024,
  diagnosticBytes: 2048,
  footerBytes: 384,
  batchFiles: 64,
  batchPathBytes: 64 * 1024,
};
