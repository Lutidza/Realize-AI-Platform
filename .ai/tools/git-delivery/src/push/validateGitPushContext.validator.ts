/**
 * @file .ai/tools/git-delivery/src/push/validateGitPushContext.validator.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Проверяет немодельное разрешение push и привязку проверок к разрешённым коммитам.
 */

import { parseContext, PolicyError } from "../contracts.ts";
import type { GitPushContext } from "./GitPush.types.ts";

function record(value: unknown, keys: string[]): Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !keys.includes(key))
  ) {
    throw new PolicyError(
      "worker_scope_invalid",
      "Неизвестные поля контекста push.",
    );
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, pattern: RegExp): string {
  if (
    typeof value !== "string" ||
    value !== value.trim() ||
    !pattern.test(value)
  ) {
    throw new PolicyError(
      "worker_scope_invalid",
      "Некорректное значение контекста push.",
    );
  }
  return value;
}

function list(value: unknown, pattern: RegExp, max: number): string[] {
  if (!Array.isArray(value) || value.length > max)
    throw new PolicyError(
      "worker_scope_invalid",
      "Некорректный список контекста push.",
    );
  const result = value.map((item) => text(item, pattern));
  if (new Set(result).size !== result.length)
    throw new PolicyError(
      "worker_scope_invalid",
      "Повтор значения контекста push.",
    );
  return result;
}

export function validateGitPushContext(input: unknown): GitPushContext {
  const source = record(input, [
    "version",
    "requestId",
    "projectId",
    "taskId",
    "repositoryRoot",
    "authorization",
    "target",
    "verification",
  ]);
  const authorization = record(source.authorization, ["actions", "scope"]);
  const scope = record(authorization.scope, ["mode", "commits"]);
  if (
    !Array.isArray(authorization.actions) ||
    authorization.actions.length !== 1 ||
    authorization.actions[0] !== "push" ||
    scope.mode !== "commits"
  ) {
    throw new PolicyError(
      "worker_scope_invalid",
      "Нужно отдельное разрешение push с областью коммитов.",
    );
  }
  // Общие идентификаторы проверяет существующий контракт; область push разбирается отдельно.
  const { authorization: _authorization, ...base } = parseContext({
    version: source.version,
    requestId: source.requestId,
    projectId: source.projectId,
    taskId: source.taskId,
    repositoryRoot: source.repositoryRoot,
    authorization: { actions: ["push"], scope: { mode: "all" } },
  });
  const oid = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
  const commits = list(scope.commits, oid, 2048);
  const target = record(source.target, [
    "connectionKey",
    "connectionRevision",
    "repositorySlug",
    "transport",
    "branch",
    "sourceOid",
    "remoteOid",
  ]);
  if (
    target.connectionKey !== "github:primary" ||
    !Number.isSafeInteger(target.connectionRevision) ||
    Number(target.connectionRevision) < 1 ||
    !["https", "ssh"].includes(String(target.transport))
  ) {
    throw new PolicyError(
      "worker_scope_invalid",
      "Нужно явное подключение, ревизия и транспорт push.",
    );
  }
  const branch = text(
    target.branch,
    /^(?![-/])(?!.*(?:\.\.|\/\/|@\{|[\x00-\x20\x7f~^:?*\[\\]))[^\s]{1,240}$/,
  );
  if (
    branch.endsWith("/") ||
    branch.endsWith(".") ||
    branch
      .split("/")
      .some((part) => part.startsWith(".") || part.endsWith(".lock"))
  )
    throw new PolicyError("worker_scope_invalid", "Недопустимая ветка push.");
  const sourceOid = text(target.sourceOid, oid);
  const remoteOid =
    target.remoteOid === null ? null : text(target.remoteOid, oid);
  if (
    (remoteOid && remoteOid.length !== sourceOid.length) ||
    commits.some((commit) => commit.length !== sourceOid.length)
  )
    throw new PolicyError(
      "worker_scope_invalid",
      "Формат хешей push не согласован.",
    );
  const verification = record(source.verification, [
    "requiredChecks",
    "results",
  ]);
  const requiredChecks = list(
    verification.requiredChecks,
    /^[A-Za-z0-9][A-Za-z0-9_.-]{0,95}$/,
    128,
  );
  if (
    !requiredChecks.length ||
    !Array.isArray(verification.results) ||
    verification.results.length > 4096
  )
    throw new PolicyError(
      "checks_required",
      "Нужны проверки разрешённого набора коммитов.",
    );
  const results = verification.results.map((value) => {
    const entry = record(value, ["id", "status", "commit"]);
    const id = text(entry.id, /^[A-Za-z0-9][A-Za-z0-9_.-]{0,95}$/);
    const commit = text(entry.commit, oid);
    if (
      !requiredChecks.includes(id) ||
      !commits.includes(commit) ||
      !["passed", "failed"].includes(String(entry.status))
    )
      throw new PolicyError(
        "checks_stale_or_missing",
        "Проверка выходит за назначенный набор.",
      );
    return { id, commit, status: entry.status as "passed" | "failed" };
  });
  const passed = new Set(
    results
      .filter((result) => result.status === "passed")
      .map((result) => `${result.id}:${result.commit}`),
  );
  if (
    results.length !== commits.length * requiredChecks.length ||
    passed.size !== results.length ||
    commits.some((commit) =>
      requiredChecks.some((id) => !passed.has(`${id}:${commit}`)),
    )
  ) {
    throw new PolicyError(
      "checks_stale_or_missing",
      "Не все разрешённые коммиты имеют успешные проверки.",
    );
  }
  return {
    ...base,
    authorization: { actions: ["push"], scope: { mode: "commits", commits } },
    target: {
      connectionKey: "github:primary",
      connectionRevision: Number(target.connectionRevision),
      repositorySlug: text(
        target.repositorySlug,
        /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9_.-]{1,100}$/,
      ),
      transport: target.transport as "https" | "ssh",
      branch,
      sourceOid,
      remoteOid,
    },
    verification: { requiredChecks, results },
  };
}
