/**
 * @file services/ai-execution-worker/src/createExecutionCheckEnvironment.config.ts
 * @version 1.0.1
 * @date 2026-11-07
 * @description Формирует allowlisted окружение проверки и обязательные ограничения isolated build.
 */
import { EXECUTION_CHECK_ENVIRONMENT_NAMES } from "./executionVerificationPolicy.config";
import type { ExecutionCheckInput } from "./ExecutionVerification.types";

/** Не наследует provider/Git credentials и не позволяет отключить runtime isolation. */
export function createExecutionCheckEnvironment(
  input: Pick<ExecutionCheckInput, "command" | "environment">,
): Record<string, string> {
  const environment: Record<string, string> = {
    CI: "true",
    NEXT_TELEMETRY_DISABLED: "1",
    NODE_ENV: "test",
  };
  for (const name of EXECUTION_CHECK_ENVIRONMENT_NAMES) {
    if (process.env[name]) environment[name] = process.env[name];
  }
  for (const [name, value] of Object.entries(input.environment ?? {})) {
    if (name.startsWith("REALIZE_GIT_") || name === "NODE_OPTIONS") continue;
    if (value === undefined) delete environment[name];
    else environment[name] = value;
  }
  environment.REALIZE_AI_RUNTIME_ISOLATED = "true";
  environment.NODE_ENV =
    input.environment?.NODE_ENV ||
    (input.command === "npm run build" ? "production" : "test");
  if (input.command === "npm run build") {
    environment.REALIZE_BUILD_WITHOUT_DATABASE = "true";
    environment.TURBO_TASKS_AVAILABLE_PARALLELISM = "2";
  } else delete environment.REALIZE_BUILD_WITHOUT_DATABASE;
  // Бюджет принадлежит серверу и входит в recipe проверки вместе с окружением.
  if (input.command === "npm run typecheck")
    environment.NODE_OPTIONS = "--max-old-space-size=2048";
  return environment;
}
