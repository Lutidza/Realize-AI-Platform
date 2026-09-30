/**
 * @file .ai/tools/agent-search/acceptance/searchAcceptance.config.mjs
 * @version 1.0.0
 * @date 2026-09-29
 * @description Задаёт обязательные наборы приёмки поиска и пределы её процессов.
 * @see documentation/architecture/repository-search.md
 */
export const SEARCH_ACCEPTANCE_SUITES = Object.freeze({
  repository: {
    minimum: 62,
    files: [
      "tests/int/import-resolution.int.spec.ts",
      "tests/int/repository-navigation.int.spec.ts",
      "tests/int/mcp-repository.int.spec.ts",
      "tests/int/mcp-protocol.int.spec.ts",
      "tests/int/search-observation-runtime.int.spec.ts",
    ],
  },
  managed: { minimum: 16, files: ["tests/int/mcp-managed.int.spec.ts"] },
  observations: {
    minimum: 5,
    files: ["tests/int/search-observability-postgres.int.spec.ts"],
  },
  management: {
    minimum: 7,
    files: ["tests/int/search-observation-management-postgres.int.spec.ts"],
  },
  delivery: {
    minimum: 23,
    files: [
      "tests/int/local-search-observability.int.spec.ts",
      "tests/int/search-observability.int.spec.ts",
    ],
  },
});
export const SEARCH_ACCEPTANCE_LIMITS = Object.freeze({
  commandMs: 600000,
  logBytes: 16 * 1024 * 1024,
  responseBytes: 8192,
  navigationReadBytes: 50 * 1024 * 1024,
  importReadBytes: 4 * 1024 * 1024,
  runs: 2,
  nextHeapMiB: 2048,
  browserHeapMiB: 512,
});

/** Не наследует env приложения/учётные данные; только системный путь, proxy-free runtime и fixture values. */
export function searchAcceptanceEnvironment(artifacts) {
  const env = {};
  for (const key of [
    "PATH",
    "HOME",
    "USER",
    "LANG",
    "LC_ALL",
    "TMPDIR",
    "CI",
    "PLAYWRIGHT_BROWSERS_PATH",
  ])
    if (process.env[key] !== undefined) env[key] = process.env[key];
  return {
    ...env,
    NODE_ENV: "test",
    NODE_OPTIONS: "--no-deprecation",
    DOTENV_CONFIG_PATH: `${artifacts}/empty.env`,
    REALIZE_AI_RUNTIME_ISOLATED: "true",
    REALIZE_AI_ENABLED: "false",
    PAYLOAD_DB_PUSH: "false",
    PAYLOAD_DROP_DATABASE: "false",
    NEXT_TELEMETRY_DISABLED: "1",
    SEARCH_ACCEPTANCE_ARTIFACTS: artifacts,
  };
}
