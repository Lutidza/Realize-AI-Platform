/**
 * @file .ai/tools/git-delivery/src/merge/validateGitMergeContext.validator.ts
 * @version 1.0.0
 * @date 2026-10-13
 * @description Проверяет закрытое разрешение approved-tree merge и fingerprint фактически назначенного candidate.
 */
import { parseContext, relativeFile, PolicyError } from "../contracts.ts";
import { assertNoGitSecrets } from "../commit/assertNoGitSecrets.validator.ts";
import { assertAllowedGitChangedPaths } from "../commit/validateGitChanges.validator.ts";
import type { GitMergeContext } from "./GitMerge.types.ts";
import { hashGitMergeCandidate } from "./hashGitMergeCandidate.util.ts";
import { isAbsolute, resolve, join } from "node:path";

function invalid(): never {
  throw new PolicyError(
    "merge_context_invalid",
    "Нужен точный approved-tree контекст с двумя parents и проверенным candidate.",
  );
}
function record(input: unknown, keys: string[]): Record<string, unknown> {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.keys(input).some((key) => !keys.includes(key))
  )
    invalid();
  return input as Record<string, unknown>;
}
function text(input: unknown, pattern: RegExp): string {
  if (typeof input !== "string" || !pattern.test(input)) invalid();
  return input;
}
function oid(input: unknown): string {
  const value = text(input, /^[a-f0-9]{40}$/);
  if (/^0+$/.test(value)) invalid();
  return value;
}
function ref(input: unknown): string {
  const value = text(
    input,
    /^refs\/heads\/(?![-/])(?!.*(?:\.\.|\/\/|@\{|[\x00-\x20\x7f~^:?*\[\\]))[^\s]{1,240}$/,
  );
  if (
    value.endsWith("/") ||
    value.endsWith(".") ||
    value
      .split("/")
      .some((part) => part.startsWith(".") || part.endsWith(".lock"))
  )
    invalid();
  return value;
}

/** Unknown fields, дополнительные действия и evidence другого tree отклоняются до модели/сети. */
export function validateGitMergeContext(input: unknown): GitMergeContext {
  const source = record(input, [
    "version",
    "requestId",
    "projectId",
    "taskId",
    "repositoryRoot",
    "authorization",
    "target",
    "source",
    "candidate",
    "candidateSourceRoot",
    "identity",
    "message",
    "verification",
  ]);
  const authorization = record(source.authorization, ["actions", "scope"]);
  const scope = record(authorization.scope, ["mode"]);
  if (
    !Array.isArray(authorization.actions) ||
    authorization.actions.length !== 1 ||
    authorization.actions[0] !== "merge" ||
    scope.mode !== "approved-tree"
  )
    invalid();
  const checks = record(source.verification, ["requiredChecks", "results"]);
  const base = parseContext({
    version: source.version,
    requestId: source.requestId,
    projectId: source.projectId,
    taskId: source.taskId,
    repositoryRoot: source.repositoryRoot,
    authorization: { actions: ["commit"], scope: { mode: "all" } },
    identity: source.identity,
    verification: {
      inputPaths: [],
      requiredChecks: checks.requiredChecks,
      results: checks.results,
    },
  });
  if (!base.identity || !base.verification?.requiredChecks.length) invalid();
  const target = record(source.target, [
    "connectionKey",
    "connectionRevision",
    "repositorySlug",
    "repositoryID",
    "ref",
    "oid",
    "treeOid",
  ]);
  if (
    target.connectionKey !== "github:primary" ||
    !Number.isSafeInteger(target.connectionRevision) ||
    Number(target.connectionRevision) < 1 ||
    !Number.isSafeInteger(target.repositoryID) ||
    Number(target.repositoryID) < 1
  )
    invalid();
  const repositorySlug = text(
    target.repositorySlug,
    /^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9_.-]{1,100}$/,
  );
  if ([".", ".."].includes(repositorySlug.split("/")[1])) invalid();
  const other = record(source.source, ["ref", "oid"]);
  const candidate = record(source.candidate, [
    "treeOid",
    "approvedChangedPaths",
    "files",
  ]);
  if (!Array.isArray(candidate.approvedChangedPaths)) invalid();
  const paths = candidate.approvedChangedPaths.map(relativeFile);
  if (new Set(paths).size !== paths.length) invalid();
  assertAllowedGitChangedPaths(paths);
  const candidateSourceRoot = text(
    source.candidateSourceRoot,
    /^[^\0\r\n]{1,4096}$/,
  );
  const allowedRoot =
    join(base.repositoryRoot, ".ai-workspace", "tasks", base.taskId, "tmp") +
    "/";
  if (
    !isAbsolute(candidateSourceRoot) ||
    resolve(candidateSourceRoot) !== candidateSourceRoot ||
    !candidateSourceRoot.startsWith(allowedRoot)
  )
    invalid();
  if (
    !Array.isArray(candidate.files) ||
    candidate.files.length !== paths.length
  )
    invalid();
  const files = candidate.files
    .map((value) => {
      const file = record(value, ["path", "mode", "blobOid"]);
      const path = relativeFile(file.path);
      if (
        !(file.mode === null && file.blobOid === null) &&
        (!["100644", "100755"].includes(String(file.mode)) ||
          file.blobOid === null)
      )
        invalid();
      return {
        path,
        mode: file.mode as "100644" | "100755" | null,
        blobOid: file.blobOid === null ? null : oid(file.blobOid),
      };
    })
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  if (
    JSON.stringify(files.map((file) => file.path)) !==
    JSON.stringify([...paths].sort())
  )
    invalid();
  const message = text(source.message, /^[^\0\r]{1,4096}$/);
  const context: GitMergeContext = {
    version: 1,
    requestId: base.requestId,
    projectId: base.projectId,
    taskId: base.taskId,
    repositoryRoot: base.repositoryRoot,
    candidateSourceRoot,
    authorization: { actions: ["merge"], scope: { mode: "approved-tree" } },
    target: {
      connectionKey: "github:primary",
      connectionRevision: Number(target.connectionRevision),
      repositorySlug,
      repositoryID: Number(target.repositoryID),
      ref: ref(target.ref),
      oid: oid(target.oid),
      treeOid: oid(target.treeOid),
    },
    source: { ref: ref(other.ref), oid: oid(other.oid) },
    candidate: {
      treeOid: oid(candidate.treeOid),
      approvedChangedPaths: paths.sort(),
      files,
    },
    identity: base.identity,
    message,
    verification: {
      requiredChecks: base.verification.requiredChecks,
      results: base.verification.results,
    },
  };
  if (
    context.target.ref === context.source.ref ||
    context.target.oid === context.source.oid
  )
    invalid();
  const fingerprint = hashGitMergeCandidate(context);
  for (const check of context.verification.requiredChecks) {
    const result = context.verification.results.find(
      (item) => item.id === check,
    );
    if (
      !result ||
      result.status !== "passed" ||
      result.fingerprint !== fingerprint
    )
      throw new PolicyError(
        "merge_checks_stale_or_missing",
        "Все обязательные проверки должны относиться к назначенному candidate tree и parents.",
      );
  }
  assertNoGitSecrets(Buffer.from(JSON.stringify(context)));
  return context;
}
