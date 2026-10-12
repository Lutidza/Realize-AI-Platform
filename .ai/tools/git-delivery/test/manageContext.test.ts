/**
 * @file .ai/tools/git-delivery/test/manageContext.test.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Проверяет границы доверенного разрешения manage и запрет обхода scope.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { PolicyError } from "../src/Policy.error.ts";
import { validateGitManageContext } from "../src/manage/validateGitManageContext.validator.ts";
import type { GitManageContext } from "../src/manage/GitManage.types.ts";

const context: GitManageContext = {
  version: 1,
  requestId: "request-1",
  projectId: "fixture",
  taskId: "fixture",
  repositoryRoot: "/tmp/repository",
  authorization: { actions: ["manage"], scope: { mode: "repository" } },
  operation: { kind: "branches-list" },
};
const denied = (value: unknown) =>
  assert.throws(() => validateGitManageContext(value), PolicyError);

test("manage read допускает отсутствие expected и возвращает отдельный validated context", () => {
  const parsed = validateGitManageContext(context);
  assert.deepEqual(parsed, context);
  assert.notEqual(parsed, context);
});

test("manage отвергает неизвестные поля, другие actions и смешение operation параметров", () => {
  for (const value of [
    { ...context, arbitrary: "git reset" },
    {
      ...context,
      authorization: {
        actions: ["manage", "push"],
        scope: { mode: "repository" },
      },
    },
    { ...context, operation: { kind: "branches-list", remote: "origin" } },
    { ...context, repositoryRoot: "/tmp/../repository" },
    {
      ...context,
      authorization: { ...context.authorization, externalWorktrees: [] },
    },
  ])
    denied(value);
});

test("manage write требует HEAD/branch и отвергает branch option injection", () => {
  const expected = { head: "a".repeat(40), branch: "main" };
  denied({ ...context, operation: { kind: "branch-switch", name: "topic" } });
  for (const name of [
    "--force",
    "refs/../main",
    "main.lock",
    "@",
    ".hidden",
    "topic\nsecret",
    "a@{b",
  ])
    denied({
      ...context,
      expected,
      operation: { kind: "branch-switch", name },
    });
  assert.equal(
    validateGitManageContext({
      ...context,
      expected,
      operation: {
        kind: "branch-create",
        name: "feature/topic",
        switch: false,
      },
    }).expected!.head,
    expected.head,
  );
});

test("remote rename сохраняет owner, transport и отвергает credentials/host/query", () => {
  const expected = { head: "a".repeat(40), branch: "main" };
  const operation = {
    kind: "remote-set-url",
    remote: "origin",
    expectedURL: "https://github.com/Owner/Old.git",
    url: "https://github.com/Owner/New.git",
  };
  assert.equal(
    validateGitManageContext({ ...context, expected, operation }).operation
      .kind,
    "remote-set-url",
  );
  for (const url of [
    "https://github.com/Other/New.git",
    "git@github.com:Owner/New.git",
    "https://token@github.com/Owner/New.git",
    "https://github.com.evil/Owner/New.git",
    "https://github.com/Owner/New.git?token=x",
  ])
    denied({ ...context, expected, operation: { ...operation, url } });
});

test("repair требует точный external allowlist, log и diff ограничены", () => {
  const expected = { head: "a".repeat(40), branch: null };
  denied({
    ...context,
    expected,
    operation: { kind: "worktree-repair", paths: ["/tmp/worktree"] },
  });
  denied({
    ...context,
    expected,
    authorization: {
      ...context.authorization,
      externalWorktrees: ["/tmp/other"],
    },
    operation: { kind: "worktree-repair", paths: ["/tmp/worktree"] },
  });
  for (const limit of [0, 101, 1.5])
    denied({ ...context, operation: { kind: "log", limit } });
  for (const paths of [["../outside"], [".git/config"], ["file", "file"]])
    denied({
      ...context,
      operation: {
        kind: "diff",
        scope: "index",
        paths,
        contextLines: 3,
        limitBytes: 1024,
      },
    });
});
