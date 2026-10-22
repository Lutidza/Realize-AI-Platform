/**
 * @file .ai/tools/git-delivery/test/classifyGitFailure.util.test.ts
 * @version 1.0.2
 * @date 2026-10-22
 * @description Проверяет конечные категории Git, приоритет причин и сокрытие диагностических данных.
 */

import assert from "node:assert/strict";
import { inspect } from "node:util";
import { test } from "node:test";
import { classifyGitFailure } from "@realize/git-runtime";
import { GitFailure } from "@realize/git-runtime";
import { GIT_FAILURE_CATEGORIES } from "@realize/git-runtime";
import type { GitFailureCategory } from "@realize/git-runtime";

const diagnostics: Array<[GitFailureCategory, string]> = [
  [
    "authentication_failed",
    "fatal: Authentication failed for 'https://fixture.invalid/repository/'",
  ],
  [
    "authentication_failed",
    "git@fixture.invalid: Permission denied (publickey).\nfatal: Could not read from remote repository.",
  ],
  [
    "authentication_failed",
    "remote: HTTP Basic: Access denied\nfatal: Authentication failed",
  ],
  [
    "authentication_failed",
    "fatal: could not read Username for 'https://fixture.invalid': terminal prompts disabled",
  ],
  ["authentication_failed", "remote: Invalid username or password."],
  [
    "authentication_failed",
    "fatal: unable to access 'https://fixture.invalid/': The requested URL returned error: 401",
  ],
  [
    "authentication_failed",
    "git@fixture.invalid: Permission denied (password,keyboard-interactive).",
  ],
  [
    "permission_denied",
    "remote: Permission to fixture/repository.git denied to fixture-user.",
  ],
  ["permission_denied", "remote: Write access to repository not granted."],
  [
    "permission_denied",
    "fatal: unable to access 'https://fixture.invalid/': The requested URL returned error: 403",
  ],
  [
    "branch_protected",
    "remote: error: GH006: Protected branch update failed.\n! [remote rejected] main -> main (pre-receive hook declined)",
  ],
  [
    "branch_protected",
    "remote: error: GH013: Repository rule violations found",
  ],
  [
    "branch_protected",
    "remote: You are not allowed to push code to protected branches on this project.",
  ],
  ["non_fast_forward", "! [rejected] main -> main (non-fast-forward)"],
  ["non_fast_forward", "! [rejected] main -> main (fetch first)"],
  [
    "hook_rejected",
    "! [remote rejected] main -> main (pre-receive hook declined)",
  ],
  ["hook_rejected", "error: hook declined to update refs/heads/main"],
  [
    "remote_guard_denied",
    "git_remote_guard_denied\nerror: failed to push some refs\npre-push hook failed",
  ],
  [
    "repository_unavailable",
    "remote: Repository not found.\nfatal: repository 'https://fixture.invalid/private' not found",
  ],
  [
    "repository_unavailable",
    "fatal: 'fixture' does not appear to be a git repository",
  ],
  ["repository_unavailable", "fatal: Could not read from remote repository."],
  [
    "transport_failure",
    "fatal: unable to access 'https://fixture.invalid/': Could not resolve host: fixture.invalid",
  ],
  [
    "transport_failure",
    "ssh: Could not resolve hostname fixture.invalid: Temporary failure in name resolution\nfatal: Could not read from remote repository.",
  ],
  [
    "transport_failure",
    "fatal: Failed to connect to fixture.invalid port 443: Connection refused",
  ],
  [
    "transport_failure",
    "fatal: unable to access 'https://fixture.invalid': SSL certificate problem: unable to get local issuer certificate",
  ],
  ["transport_failure", "Host key verification failed."],
  [
    "transport_failure",
    "error: RPC failed; curl 56 Recv failure: Connection reset by peer",
  ],
  [
    "timeout",
    "ssh: connect to host fixture.invalid port 22: Connection timed out",
  ],
  ["unknown", "error: failed to push some refs to 'https://fixture.invalid'"],
  ["unknown", ""],
  [
    "unknown",
    '\0\uFFFD\u202eнеизвестная диагностика\n{"token":"synthetic-value"}',
  ],
];

test("защита email распознаётся по GH007 и тексту без раскрытия адреса", () => {
  for (const diagnostic of [
    "remote: error: GH007\nsynthetic-private@example.invalid\npre-receive hook declined",
    "remote: Push would publish a private email address.\nsynthetic-private@example.invalid",
  ]) {
    const category = classifyGitFailure(diagnostic);
    assert.equal(category, "email_privacy");
    const failure = new GitFailure(
      "git_command_failed",
      "Безопасный текст",
      1,
      category,
    );
    assert.equal(
      JSON.stringify(failure).includes("synthetic-private@example.invalid"),
      false,
    );
  }
});

for (const [index, [category, diagnostic]] of diagnostics.entries()) {
  test(`классификация ${index + 1}: ${category}`, () => {
    assert.equal(classifyGitFailure(diagnostic), category);
  });
}

test("ошибка сохраняет прежние аргументы и использует unknown по умолчанию", () => {
  const failure = new GitFailure("git_command_failed", "Безопасный текст", 7);
  assert.equal(failure.name, "GitFailure");
  assert.equal(failure.message, "Безопасный текст");
  assert.equal(failure.code, "git_command_failed");
  assert.equal(failure.exitCode, 7);
  assert.equal(failure.category, "unknown");
  assert.equal(new GitFailure("fixture", "Безопасный текст").exitCode, null);
});

test("секреты, URL и имена из диагностики не переходят в ошибку или сериализацию", () => {
  const fixtureUrl = new URL("https://fixture.invalid/private");
  fixtureUrl.username = "private-fixture-user";
  fixtureUrl.password = "synthetic-token-12345";
  const privateValues = [
    "synthetic-token-12345",
    "private-fixture-user",
    "private-fixture-branch",
    fixtureUrl.href,
  ];
  for (const [, diagnostic] of diagnostics) {
    const raw = `${diagnostic}\n${privateValues.join("\n")}`;
    const category = classifyGitFailure(raw);
    assert.ok(GIT_FAILURE_CATEGORIES.includes(category));
    const error = new GitFailure(
      "git_command_failed",
      "Безопасный текст",
      1,
      category,
    );
    const serialized = `${JSON.stringify(error)}\n${inspect(error)}\n${error.stack}`;
    for (const value of privateValues) {
      assert.equal(serialized.includes(value), false);
    }
  }
});

test("произвольные бинарные и длинные строки дают только конечную категорию", () => {
  for (const value of [
    Buffer.from(Array.from({ length: 256 }, (_, index) => index)).toString(
      "utf8",
    ),
    "x".repeat(64 * 1024),
    "\ud800\udfff\0".repeat(100),
  ]) {
    assert.equal(classifyGitFailure(value), "unknown");
  }
});
