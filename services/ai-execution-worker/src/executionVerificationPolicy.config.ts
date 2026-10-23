/**
 * @file services/ai-execution-worker/src/executionVerificationPolicy.config.ts
 * @version 1.0.0
 * @date 2026-10-22
 * @description Задаёт server allowlist команд, политику повторного использования и исключения runtime-файлов.
 */
import { EXECUTION_CHECK_COMMANDS } from "@realize/change-engine";
import type { ExecutionCheckDefinition } from "./ExecutionVerification.types";

export const EXECUTION_VERIFICATION_COMMANDS: Readonly<
  Record<string, ExecutionCheckDefinition>
> = {
  // Git index/ignore определяют кандидатов secrets; source receipt не заменяет их проверку.
  "node scripts/security/check-secrets.mjs": {
    command: ["node", "scripts/security/check-secrets.mjs"],
    reuse: "never",
  },
  // Build создаёт .next для preview; прежний pass не подтверждает наличие артефактов.
  "npm run build": { command: ["npm", "run", "build"], reuse: "never" },
  "npm run format:check": {
    command: ["npm", "run", "format:check"],
    reuse: "local",
  },
  "npm run lint": { command: ["npm", "run", "lint"], reuse: "local" },
  "npm run typecheck": { command: ["npm", "run", "typecheck"], reuse: "local" },
  // БД и browser state не имеют проверяемого source binding в этом контракте.
  "npm run payload:migrate:status": {
    command: ["npm", "run", "payload:migrate:status"],
    reuse: "never",
  },
  "npm run test:e2e": { command: ["npm", "run", "test:e2e"], reuse: "never" },
  "npm run test:int": { command: ["npm", "run", "test:int"], reuse: "never" },
};

if (
  EXECUTION_CHECK_COMMANDS.some(
    (command) => !Object.hasOwn(EXECUTION_VERIFICATION_COMMANDS, command),
  ) ||
  Object.keys(EXECUTION_VERIFICATION_COMMANDS).some(
    (command) =>
      !(EXECUTION_CHECK_COMMANDS as readonly string[]).includes(command),
  )
) {
  throw new Error("Execution check registry and runner are out of sync.");
}

/** Только generated runtime: новые source-каталоги остаются в полном inventory. */
export const EXECUTION_VERIFICATION_EXCLUSIONS = [
  ".next",
  ".ai/tools/agent-runtime/runtime",
  ".ai/tools/agent-search/runtime",
  ".ai/tools/task-workspace/runtime",
  "tsconfig.tsbuildinfo",
];

export const EXECUTION_CHECK_ENVIRONMENT_NAMES = [
  "DATABASE_URI",
  "DATABASE_URL",
  "HOME",
  "LANG",
  "LC_ALL",
  "NEXT_PUBLIC_SERVER_URL",
  "NEXT_PUBLIC_SITE_URL",
  "PATH",
  "PAYLOAD_PUBLIC_SERVER_URL",
  "PAYLOAD_PUBLIC_SITE_URL",
  "PAYLOAD_SECRET",
  "POSTGRES_SSL",
  "PREVIEW_SECRET",
  "SSL_CERT_DIR",
  "SSL_CERT_FILE",
] as const;
