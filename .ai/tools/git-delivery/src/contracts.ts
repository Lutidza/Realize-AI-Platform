/**
 * @file .ai/tools/git-delivery/src/contracts.ts
 * @version 1.2.0
 * @date 2026-10-11
 * @description Проверяет отдельные входы модели и вызывающей среды, сохраняя публичные экспорты Git-контракта.
 */
import { isAbsolute } from "node:path";

import type {
  Action,
  CheckResult,
  Command,
  Context,
  Scope,
} from "./GitDelivery.types.ts";
import { PolicyError } from "./Policy.error.ts";
import { parseGitCommitRecovery } from "./parseGitCommitRecovery.validator.ts";

export type {
  Action,
  CheckResult,
  Command,
  Context,
  Identity,
  Result,
  Scope,
} from "./GitDelivery.types.ts";
export { PolicyError } from "./Policy.error.ts";
export { emptyResult } from "./emptyResult.util.ts";

function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !keys.includes(key))
  ) {
    throw new PolicyError(
      "invalid_input",
      "Неизвестные поля или неверный формат входа.",
    );
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, max = 128): string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > max ||
    value.includes("\0")
  ) {
    throw new PolicyError(
      "invalid_input",
      "Ожидалась непустая строка допустимой длины.",
    );
  }
  return value;
}

function identifier(value: unknown): string {
  const result = text(value, 96);
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(result)) {
    throw new PolicyError(
      "invalid_identifier",
      "Некорректный идентификатор задания.",
    );
  }
  return result;
}

/** Принимает точный относительный путь без обхода родителя и служебного каталога Git. */
export function relativeFile(value: unknown): string {
  const file = text(value, 4096);
  if (
    isAbsolute(file) ||
    file.includes("\\") ||
    file
      .split("/")
      .some(
        (part) =>
          !part ||
          part === "." ||
          part === ".." ||
          part.toLowerCase() === ".git",
      )
  ) {
    throw new PolicyError(
      "invalid_path",
      "Нужен точный относительный путь файла внутри репозитория.",
    );
  }
  return file;
}

function strings(value: unknown, parser: (v: unknown) => string): string[] {
  if (!Array.isArray(value) || value.length > 2048) {
    throw new PolicyError(
      "invalid_input",
      "Ожидался ограниченный список значений.",
    );
  }
  const parsed = value.map(parser);
  if (new Set(parsed).size !== parsed.length)
    throw new PolicyError("invalid_input", "Повторяющиеся значения.");
  return parsed;
}

const actions: Action[] = ["inspect", "commit", "push", "commit_push"];
function action(value: unknown): Action {
  if (!actions.includes(value as Action))
    throw new PolicyError("invalid_action", "Действие не поддерживается.");
  return value as Action;
}

/** Разбирает команду модели без разрешений, авторства и результатов проверок. */
export function parseCommand(value: unknown): Command {
  const source = object(value, ["action", "message"]);
  const selected = action(source.action);
  if (
    source.message !== undefined &&
    selected !== "commit" &&
    selected !== "commit_push"
  ) {
    throw new PolicyError(
      "invalid_input",
      "Сообщение допустимо только для создания commit.",
    );
  }
  return {
    action: selected,
    ...(source.message !== undefined
      ? { message: text(source.message, 4096) }
      : {}),
  };
}

/** Разбирает доверенный контекст отдельно от команды; порядок полей сохраняет binding старых журналов. */
export function parseContext(value: unknown): Context {
  const source = object(value, [
    "version",
    "requestId",
    "projectId",
    "taskId",
    "repositoryRoot",
    "authorization",
    "identity",
    "verification",
    "recovery",
  ]);
  if (source.version !== 1)
    throw new PolicyError("invalid_context", "Нужен контекст версии 1.");
  const root = text(source.repositoryRoot, 4096);
  if (!isAbsolute(root))
    throw new PolicyError(
      "invalid_context",
      "Рабочая копия должна иметь абсолютный путь.",
    );
  const auth = object(source.authorization, ["actions", "scope"]);
  const scope = object(auth.scope, ["mode", "paths", "includePartialIndex"]);
  const hasPartialIndexFlag = Object.hasOwn(scope, "includePartialIndex");
  let parsedScope: Scope;
  if (scope.mode === "all" && scope.paths === undefined) {
    if (hasPartialIndexFlag && scope.includePartialIndex !== true) {
      throw new PolicyError(
        "invalid_scope",
        "Включение частичного индекса требует явного true в полной области.",
      );
    }
    parsedScope = {
      mode: "all",
      ...(hasPartialIndexFlag ? { includePartialIndex: true } : {}),
    };
  } else if (scope.mode === "paths" && !hasPartialIndexFlag) {
    const paths = strings(scope.paths, relativeFile);
    if (!paths.length)
      throw new PolicyError("invalid_scope", "Пустая область путей.");
    parsedScope = { mode: "paths", paths };
  } else
    throw new PolicyError(
      "invalid_scope",
      "Область должна быть all или списком точных путей.",
    );
  const context: Context = {
    version: 1,
    requestId: identifier(source.requestId),
    projectId: identifier(source.projectId),
    taskId: identifier(source.taskId),
    repositoryRoot: root,
    authorization: {
      actions: strings(auth.actions, action) as Action[],
      scope: parsedScope,
    },
  };
  if (source.identity !== undefined) {
    const identity = object(source.identity, ["name", "email"]);
    const name = text(identity.name, 160);
    const email = text(identity.email, 254);
    if (/[\r\n<>]/.test(name) || !/^[^\s<>@]+@[^\s<>@]+$/.test(email)) {
      throw new PolicyError(
        "invalid_identity",
        "Некорректное авторство commit.",
      );
    }
    context.identity = { name, email };
  }
  if (source.verification !== undefined) {
    const verification = object(source.verification, [
      "inputPaths",
      "requiredChecks",
      "results",
    ]);
    if (
      !Array.isArray(verification.results) ||
      verification.results.length > 128
    ) {
      throw new PolicyError(
        "invalid_checks",
        "Некорректные результаты проверок.",
      );
    }
    const results = verification.results.map((value): CheckResult => {
      const result = object(value, ["id", "status", "fingerprint"]);
      if (
        (result.status !== "passed" && result.status !== "failed") ||
        typeof result.fingerprint !== "string" ||
        !/^[a-f0-9]{64}$/.test(result.fingerprint)
      ) {
        throw new PolicyError(
          "invalid_checks",
          "Результат не содержит корректного статуса и отпечатка.",
        );
      }
      return {
        id: identifier(result.id),
        status: result.status,
        fingerprint: result.fingerprint,
      };
    });
    if (new Set(results.map((r) => r.id)).size !== results.length)
      throw new PolicyError("invalid_checks", "Повтор результата проверки.");
    context.verification = {
      inputPaths: strings(verification.inputPaths, relativeFile),
      requiredChecks: strings(verification.requiredChecks, identifier),
      results,
    };
  }
  if (source.recovery !== undefined) {
    if (!context.authorization.actions.includes("commit")) {
      throw new PolicyError(
        "commit_recovery_invalid",
        "Восстановление допустимо только при разрешённом commit.",
      );
    }
    // Новое поле добавляется после legacy-полей, чтобы не менять их порядок сериализации.
    context.recovery = parseGitCommitRecovery(source.recovery);
  }
  return context;
}
