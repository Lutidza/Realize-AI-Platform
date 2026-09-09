/**
 * @file .ai/tools/git-delivery/src/contracts.ts
 * @version 1.0.0
 * @date 2026-09-08
 * @description Локальный программный контракт ADR-0016; данные модели и контекст запуска разбираются отдельно.
 */
import { isAbsolute } from "node:path";

export type Action = "inspect" | "commit" | "push" | "commit_push";
export type Scope = { mode: "all" } | { mode: "paths"; paths: string[] };
export type Command = { action: Action; message?: string };
export type CheckResult = {
  id: string;
  status: "passed" | "failed";
  fingerprint: string;
};
export type Identity = { name: string; email: string };
export type Context = {
  version: 1;
  requestId: string;
  projectId: string;
  taskId: string;
  repositoryRoot: string;
  authorization: { actions: Action[]; scope: Scope };
  identity?: Identity;
  verification?: {
    inputPaths: string[];
    requiredChecks: string[];
    results: CheckResult[];
  };
};
export type Result = {
  version: 1;
  requestId: string | null;
  action: Action | null;
  status: "succeeded" | "noop" | "partial" | "blocked" | "failed";
  branch: string | null;
  commit: string | null;
  commitCreated: boolean | null;
  pushStatus: "not_requested" | "not_attempted";
  changes: { items: { path: string; status: string }[]; truncated: boolean };
  fingerprint: string | null;
  checks: { id: string; status: "passed" | "failed"; reused: boolean }[];
  errorCode: string | null;
  summary: string;
  retryable: boolean;
};

export class PolicyError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "PolicyError";
    this.code = code;
  }
}

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
  const scope = object(auth.scope, ["mode", "paths"]);
  let parsedScope: Scope;
  if (scope.mode === "all" && scope.paths === undefined)
    parsedScope = { mode: "all" };
  else if (scope.mode === "paths") {
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
  return context;
}

export function emptyResult(): Result {
  return {
    version: 1,
    requestId: null,
    action: null,
    status: "blocked",
    branch: null,
    commit: null,
    commitCreated: false,
    pushStatus: "not_requested",
    changes: { items: [], truncated: false },
    fingerprint: null,
    checks: [],
    errorCode: null,
    summary: "",
    retryable: false,
  };
}
