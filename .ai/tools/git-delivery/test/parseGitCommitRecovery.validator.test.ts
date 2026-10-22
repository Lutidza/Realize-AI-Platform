/**
 * @file .ai/tools/git-delivery/test/parseGitCommitRecovery.validator.test.ts
 * @version 1.0.1
 * @date 2026-10-22
 * @description Проверяет границы разрешения recovery, прежний формат контекста и evidence нового снимка.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { parseCommand, parseContext } from "../src/contracts.ts";
import type { Context } from "../src/GitDelivery.types.ts";
import { PolicyError } from "@realize/git-runtime";
import { parseGitCommitRecovery } from "../src/parseGitCommitRecovery.validator.ts";
import { validateGitWorkerContext } from "../src/worker/validateGitWorkerContext.validator.ts";

function context(): Context {
  return {
    version: 1,
    requestId: "fixture-recovery",
    projectId: "fixture-project",
    taskId: "fixture-task",
    repositoryRoot: "/fixture/repository",
    authorization: { actions: ["commit"], scope: { mode: "all" } },
    identity: { name: "Fixture Author", email: "fixture@example.invalid" },
    verification: {
      inputPaths: ["package.json"],
      requiredChecks: ["types", "tests"],
      results: [
        { id: "types", status: "passed", fingerprint: "b".repeat(64) },
        { id: "tests", status: "passed", fingerprint: "b".repeat(64) },
      ],
    },
  };
}

function recoveryError(error: unknown): boolean {
  return (
    error instanceof PolicyError && error.code === "commit_recovery_invalid"
  );
}

test("recovery допускает граничные попытки и сохраняет только явные поля", () => {
  for (const attempt of [1, 16]) {
    const recovery = { attempt, previousFingerprint: "a".repeat(64) };
    assert.deepEqual(parseGitCommitRecovery(recovery), recovery);
    assert.deepEqual(
      parseContext({ ...context(), recovery }).recovery,
      recovery,
    );
  }
});

test("recovery отклоняет неизвестные поля и неверный номер попытки", () => {
  const previousFingerprint = "a".repeat(64);
  for (const value of [
    null,
    [],
    "recovery",
    {},
    { attempt: 1 },
    { attempt: 1, previousFingerprint, reset: true },
    ...[undefined, null, 0, -1, 17, 1.5, "1", NaN, Infinity].map((attempt) => ({
      attempt,
      previousFingerprint,
    })),
  ]) {
    assert.throws(() => parseGitCommitRecovery(value), recoveryError);
  }
});

test("recovery требует прежний lowercase SHA-256 без пробелов", () => {
  for (const previousFingerprint of [
    undefined,
    null,
    123,
    "a".repeat(40),
    "a".repeat(63),
    "a".repeat(65),
    "A".repeat(64),
    "g".repeat(64),
    ` ${"a".repeat(64)}`,
    `${"a".repeat(64)}\n`,
  ]) {
    assert.throws(
      () => parseGitCommitRecovery({ attempt: 1, previousFingerprint }),
      recoveryError,
    );
  }
});

test("recovery разрешён контексту с commit и не расширяет список действий", () => {
  const recovery = { attempt: 1, previousFingerprint: "a".repeat(64) };
  const source = context();
  source.authorization.actions = ["inspect", "commit", "push"];
  const parsed = parseContext({ ...source, recovery });
  assert.deepEqual(parsed.authorization, source.authorization);
  assert.deepEqual(parsed.recovery, recovery);
  for (const actions of [[], ["inspect"], ["push"], ["commit_push"]]) {
    assert.throws(
      () =>
        parseContext({
          ...source,
          authorization: { ...source.authorization, actions },
          recovery,
        }),
      recoveryError,
    );
  }
  assert.throws(() => parseCommand({ action: "commit", recovery }));
});

test("recovery добавляется последним без изменения legacy JSON контекста", () => {
  const source = context();
  const legacyJson = JSON.stringify(source);
  const recovery = { attempt: 1, previousFingerprint: "a".repeat(64) };
  assert.equal(JSON.stringify(parseContext(source)), legacyJson);
  const parsed = parseContext({ recovery, ...source });
  assert.equal(Object.keys(parsed).at(-1), "recovery");
  assert.equal(
    JSON.stringify(parsed),
    `${legacyJson.slice(0, -1)},"recovery":${JSON.stringify(recovery)}}`,
  );
});

test("worker принимает recovery с проверками текущего снимка и отклоняет смешанное evidence", () => {
  const source = context();
  source.recovery = { attempt: 1, previousFingerprint: "a".repeat(64) };
  assert.deepEqual(validateGitWorkerContext("commit", source), source);
  source.verification!.results[1].fingerprint = "a".repeat(64);
  assert.throws(
    () => validateGitWorkerContext("commit", source),
    (error) =>
      error instanceof PolicyError && error.code === "checks_stale_or_missing",
  );
});
