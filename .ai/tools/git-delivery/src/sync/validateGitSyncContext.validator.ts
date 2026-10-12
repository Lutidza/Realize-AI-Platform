/**
 * @file .ai/tools/git-delivery/src/sync/validateGitSyncContext.validator.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Проверяет точное немодельное разрешение fetch/pull без произвольных команд, URL и режимов merge.
 */

import { parseContext, PolicyError } from "../contracts.ts";
import type { GitSyncAction, GitSyncContext } from "./GitSync.types.ts";

function record(value: unknown, keys: string[]): Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !keys.includes(key))
  )
    throw new PolicyError(
      "sync_context_invalid",
      "Некорректные поля контекста синхронизации.",
    );
  return value as Record<string, unknown>;
}

function text(value: unknown, pattern: RegExp): string {
  if (
    typeof value !== "string" ||
    value !== value.trim() ||
    !pattern.test(value)
  )
    throw new PolicyError(
      "sync_context_invalid",
      "Некорректное значение контекста синхронизации.",
    );
  return value;
}

/** При указанном action отклоняет разрешение другого действия; результат является независимой копией. */
export function validateGitSyncContext(
  input: unknown,
  action?: GitSyncAction,
): GitSyncContext {
  const source = record(input, [
    "version",
    "requestId",
    "projectId",
    "taskId",
    "repositoryRoot",
    "authorization",
    "target",
  ]);
  const authorization = record(source.authorization, ["actions", "scope"]);
  const scope = record(authorization.scope, ["mode"]);
  if (
    !Array.isArray(authorization.actions) ||
    authorization.actions.length !== 1 ||
    !["fetch", "pull"].includes(authorization.actions[0]) ||
    (action !== undefined && authorization.actions[0] !== action) ||
    scope.mode !== "repository"
  )
    throw new PolicyError(
      "sync_context_invalid",
      "Нужно отдельное разрешение fetch или pull на назначенный репозиторий.",
    );
  const { authorization: _authorization, ...base } = parseContext({
    version: source.version,
    requestId: source.requestId,
    projectId: source.projectId,
    taskId: source.taskId,
    repositoryRoot: source.repositoryRoot,
    authorization: { actions: ["inspect"], scope: { mode: "all" } },
  });
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
  )
    throw new PolicyError(
      "sync_context_invalid",
      "Нужно primary-подключение с точной ревизией и транспортом.",
    );
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
    throw new PolicyError(
      "sync_context_invalid",
      "Недопустимая ветка синхронизации.",
    );
  const oid = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
  const sourceOid = text(target.sourceOid, oid);
  const remoteOid = text(target.remoteOid, oid);
  const repositorySlug = text(
    target.repositorySlug,
    /^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9_.-]{1,100}$/,
  );
  if (
    /^0+$/.test(sourceOid) ||
    /^0+$/.test(remoteOid) ||
    remoteOid.length !== sourceOid.length ||
    [".", ".."].includes(repositorySlug.split("/")[1]!)
  )
    throw new PolicyError(
      "sync_context_invalid",
      "Нужны согласованные OID и конкретный репозиторий.",
    );
  return {
    ...base,
    authorization: {
      actions: [authorization.actions[0] as GitSyncAction],
      scope: { mode: "repository" },
    },
    target: {
      connectionKey: "github:primary",
      connectionRevision: Number(target.connectionRevision),
      repositorySlug,
      transport: target.transport as "https" | "ssh",
      branch,
      sourceOid,
      remoteOid,
    },
  };
}
