/**
 * @file packages/verification-runtime/src/validateVerificationPlan.validator.ts
 * @version 1.1.0
 * @date 2026-10-22
 * @description Проверяет строгий план, явные inputs и обоснование широких проверок без shell-команд.
 */
import { isAbsolute, resolve } from "node:path";
import { PolicyError } from "@realize/git-runtime";
import type {
  VerificationCheck,
  VerificationPlan,
} from "./Verification.types.ts";

const invalid = (): never => {
  throw new PolicyError(
    "verification_plan_invalid",
    "Недопустимый план проверок.",
  );
};
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : invalid();
const exact = (value: Record<string, unknown>, keys: string[]) => {
  if (Object.keys(value).some((key) => !keys.includes(key))) invalid();
};
const identifier = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/u.test(value) &&
  !value.includes("..");

/** Root inventory разрешён явно; служебные деревья исключает только его безопасный scanner. */
export function isVerificationInputPath(value: unknown): value is string {
  if (value === ".") return true;
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 512 &&
    !isAbsolute(value) &&
    !/[\0\r\n\\*?\[\]{}]/u.test(value) &&
    value
      .split("/")
      .every(
        (part) =>
          part &&
          part !== "." &&
          part !== ".." &&
          part !== ".git" &&
          part !== ".ai-workspace" &&
          part !== "node_modules",
      )
  );
}

function broad(check: VerificationCheck): boolean {
  const [command, action, name] = check.command;
  if (command === "npm")
    return (
      action === "test" ||
      action === "t" ||
      (action === "run" &&
        /^(?:test(?::int|:e2e|:all)?|build|typecheck|lint|format:check|check:all|check|ci)$/u.test(
          name ?? "",
        ))
    );
  return (
    check.command.includes("--test") &&
    !check.command.some(
      (arg) => /\.(?:[cm]?[jt]s|tsx)$/u.test(arg) && !arg.startsWith("--"),
    )
  );
}

/** Схема не доверяет extent label: известные широкие commands требуют явного reason. */
export function validateVerificationPlan(input: unknown): VerificationPlan {
  const value = object(input);
  exact(value, ["version", "projectId", "taskId", "repositoryRoot", "checks"]);
  if (
    value.version !== 1 ||
    !identifier(value.projectId) ||
    !identifier(value.taskId) ||
    typeof value.repositoryRoot !== "string" ||
    !isAbsolute(value.repositoryRoot) ||
    resolve(value.repositoryRoot) !== value.repositoryRoot ||
    /[\0\r\n]/u.test(value.repositoryRoot) ||
    !Array.isArray(value.checks) ||
    !value.checks.length ||
    value.checks.length > 64
  )
    invalid();
  const checks = (value.checks as unknown[]).map((raw): VerificationCheck => {
    const entry = object(raw);
    exact(entry, [
      "id",
      "command",
      "inputs",
      "excludeInputs",
      "environment",
      "inheritEnvironment",
      "timeoutMs",
      "reuse",
      "extent",
      "reason",
    ]);
    if (
      !identifier(entry.id) ||
      !Array.isArray(entry.command) ||
      entry.command.length < 2 ||
      entry.command.length > 128 ||
      !["node", "npm"].includes(entry.command[0]) ||
      entry.command.some(
        (arg) =>
          typeof arg !== "string" ||
          arg.length > 16384 ||
          /[\0\r\n]/u.test(arg),
      ) ||
      !Array.isArray(entry.inputs) ||
      !entry.inputs.length ||
      entry.inputs.length > 128 ||
      !entry.inputs.every(isVerificationInputPath) ||
      !Number.isSafeInteger(entry.timeoutMs) ||
      (entry.timeoutMs as number) < 1 ||
      (entry.timeoutMs as number) > 1800000 ||
      !["local", "never"].includes(entry.reuse as string) ||
      !["targeted", "full"].includes(entry.extent as string)
    )
      invalid();
    if (
      entry.excludeInputs !== undefined &&
      (!Array.isArray(entry.excludeInputs) ||
        entry.excludeInputs.length > 128 ||
        !entry.excludeInputs.every(
          (path) => isVerificationInputPath(path) && path !== ".",
        ))
    )
      invalid();
    const allowedName = (name: string) =>
      /^[A-Za-z_][A-Za-z0-9_]{0,127}$/u.test(name) &&
      !/^REALIZE_GIT_/u.test(name);
    if (entry.environment !== undefined) {
      const environment = object(entry.environment);
      if (
        Object.keys(environment).length > 64 ||
        Object.entries(environment).some(
          ([name, value]) =>
            !allowedName(name) ||
            typeof value !== "string" ||
            value.length > 32768 ||
            value.includes("\0"),
        )
      )
        invalid();
    }
    if (
      entry.inheritEnvironment !== undefined &&
      (!Array.isArray(entry.inheritEnvironment) ||
        entry.inheritEnvironment.length > 64 ||
        entry.inheritEnvironment.some(
          (name) => typeof name !== "string" || !allowedName(name),
        ))
    )
      invalid();
    if (
      entry.reason !== undefined &&
      (typeof entry.reason !== "string" ||
        entry.reason.trim().length < 8 ||
        entry.reason.length > 1000)
    )
      invalid();
    const check = structuredClone(entry) as VerificationCheck;
    check.inputs = [...new Set(check.inputs)].sort();
    if (check.excludeInputs)
      check.excludeInputs = [...new Set(check.excludeInputs)].sort();
    if (check.inheritEnvironment)
      check.inheritEnvironment = [...new Set(check.inheritEnvironment)].sort();
    if ((check.extent === "full" || broad(check)) && !check.reason)
      throw new PolicyError(
        "verification_full_reason_required",
        "Полная проверка требует обоснования.",
      );
    return check;
  });
  if (new Set(checks.map((check) => check.id)).size !== checks.length)
    invalid();
  return {
    version: 1,
    projectId: value.projectId as string,
    taskId: value.taskId as string,
    repositoryRoot: value.repositoryRoot as string,
    checks,
  };
}
