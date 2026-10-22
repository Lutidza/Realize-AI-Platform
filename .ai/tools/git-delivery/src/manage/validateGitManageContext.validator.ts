/**
 * @file .ai/tools/git-delivery/src/manage/validateGitManageContext.validator.ts
 * @version 1.0.1
 * @date 2026-10-22
 * @description Проверяет единственное немодельное разрешение локального управления Git.
 */
import { isAbsolute, resolve } from "node:path";
import { relativeFile } from "../contracts.ts";
import { PolicyError } from "@realize/git-runtime";
import type {
  GitManageContext,
  GitManageOperation,
} from "./GitManage.types.ts";
import { assertGitManageRename } from "./parseGitManageURL.validator.ts";

function invalid(): never {
  throw new PolicyError(
    "manage_context_invalid",
    "Некорректный доверенный контекст manage.",
  );
}
function record(value: unknown, keys: string[]): Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !keys.includes(key))
  )
    invalid();
  return value as Record<string, unknown>;
}
function text(value: unknown, pattern: RegExp, max = 4096): string {
  if (
    typeof value !== "string" ||
    value.length > max ||
    value !== value.trim() ||
    !pattern.test(value)
  )
    invalid();
  return value;
}
function absolute(value: unknown): string {
  const result = text(value, /^[^\0\r\n\\]+$/);
  if (!isAbsolute(result) || resolve(result) !== result) invalid();
  return result;
}
function list(
  value: unknown,
  parse: (value: unknown) => string,
  max: number,
): string[] {
  if (!Array.isArray(value) || value.length > max) invalid();
  const result = value.map(parse);
  if (new Set(result).size !== result.length) invalid();
  return result;
}
function integer(value: unknown, min: number, max: number): number {
  if (
    !Number.isSafeInteger(value) ||
    Number(value) < min ||
    Number(value) > max
  )
    invalid();
  return Number(value);
}
function branch(value: unknown): string {
  const result = text(
    value,
    /^(?![-/])(?!.*(?:\.\.|\/\/|@\{|[\x00-\x20\x7f~^:?*\[\\]))[^\s]{1,240}$/,
  );
  if (
    result === "@" ||
    result.endsWith("/") ||
    result.endsWith(".") ||
    result
      .split("/")
      .some((part) => part.startsWith(".") || part.endsWith(".lock"))
  )
    invalid();
  return result;
}

/** Write требует expected HEAD/branch; read может читать текущий снимок без optimistic precondition. */
export function validateGitManageContext(input: unknown): GitManageContext {
  const source = record(input, [
    "version",
    "requestId",
    "projectId",
    "taskId",
    "repositoryRoot",
    "authorization",
    "operation",
    "expected",
  ]);
  if (source.version !== 1) invalid();
  const authorization = record(source.authorization, [
    "actions",
    "scope",
    "externalWorktrees",
  ]);
  const scope = record(authorization.scope, ["mode"]);
  if (
    !Array.isArray(authorization.actions) ||
    authorization.actions.length !== 1 ||
    authorization.actions[0] !== "manage" ||
    scope.mode !== "repository"
  )
    invalid();
  const selected = record(source.operation, [
    "kind",
    "remote",
    "expectedURL",
    "url",
    "paths",
    "name",
    "switch",
    "limit",
    "scope",
    "contextLines",
    "limitBytes",
  ]);
  const remote = () =>
    text(selected.remote, /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/);
  let operation: GitManageOperation;
  let keys: string[];
  switch (selected.kind) {
    case "remote-inspect":
      operation = { kind: selected.kind, remote: remote() };
      keys = ["kind", "remote"];
      break;
    case "remote-set-url": {
      const expectedURL = text(selected.expectedURL, /^[^\0\r\n]+$/);
      const url = text(selected.url, /^[^\0\r\n]+$/);
      assertGitManageRename(expectedURL, url);
      operation = { kind: selected.kind, remote: remote(), expectedURL, url };
      keys = ["kind", "remote", "expectedURL", "url"];
      break;
    }
    case "worktree-list":
    case "branches-list":
      operation = { kind: selected.kind };
      keys = ["kind"];
      break;
    case "worktree-repair":
      operation = {
        kind: selected.kind,
        paths: list(selected.paths, absolute, 100),
      };
      keys = ["kind", "paths"];
      if (!operation.paths.length) invalid();
      break;
    case "branch-create":
      if (typeof selected.switch !== "boolean") invalid();
      operation = {
        kind: selected.kind,
        name: branch(selected.name),
        switch: selected.switch,
      };
      keys = ["kind", "name", "switch"];
      break;
    case "branch-switch":
      operation = { kind: selected.kind, name: branch(selected.name) };
      keys = ["kind", "name"];
      break;
    case "log":
      operation = {
        kind: selected.kind,
        limit: integer(selected.limit, 1, 100),
      };
      keys = ["kind", "limit"];
      break;
    case "diff":
      if (!["index", "working-tree"].includes(String(selected.scope)))
        invalid();
      operation = {
        kind: selected.kind,
        scope: selected.scope as "index" | "working-tree",
        paths: list(selected.paths, relativeFile, 100),
        contextLines: integer(selected.contextLines, 0, 20),
        limitBytes: integer(selected.limitBytes, 1, 1024 * 1024),
      };
      keys = ["kind", "scope", "paths", "contextLines", "limitBytes"];
      break;
    default:
      invalid();
  }
  record(selected, keys);
  const expectedSource =
    source.expected === undefined
      ? undefined
      : record(source.expected, ["head", "branch"]);
  const expected = expectedSource
    ? {
        head: text(expectedSource.head, /^[a-f0-9]{40}$/),
        branch:
          expectedSource.branch === null ? null : branch(expectedSource.branch),
      }
    : undefined;
  if (isGitManageWrite(operation) && !expected) invalid();
  const externalWorktrees =
    authorization.externalWorktrees === undefined
      ? undefined
      : list(authorization.externalWorktrees, absolute, 100);
  if (operation.kind === "worktree-repair") {
    if (
      !externalWorktrees ||
      operation.paths.some((path) => !externalWorktrees.includes(path))
    )
      invalid();
  } else if (externalWorktrees !== undefined) invalid();
  const id = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,95}$/;
  return {
    version: 1,
    requestId: text(source.requestId, id),
    projectId: text(source.projectId, id),
    taskId: text(source.taskId, id),
    repositoryRoot: absolute(source.repositoryRoot),
    authorization: {
      actions: ["manage"],
      scope: { mode: "repository" },
      ...(externalWorktrees ? { externalWorktrees } : {}),
    },
    operation,
    ...(expected ? { expected } : {}),
  };
}

export function isGitManageWrite(operation: GitManageOperation): boolean {
  return [
    "remote-set-url",
    "worktree-repair",
    "branch-create",
    "branch-switch",
  ].includes(operation.kind);
}
