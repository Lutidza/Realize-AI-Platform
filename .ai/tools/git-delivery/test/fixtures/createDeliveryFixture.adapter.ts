/**
 * @file .ai/tools/git-delivery/test/fixtures/createDeliveryFixture.adapter.ts
 * @version 1.0.1
 * @date 2026-10-22
 * @description Создаёт изолированный Git-репозиторий и evidence для тестов локальной доставки.
 */
import { FixtureGit } from "./FixtureGit.adapter.ts";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TestContext } from "node:test";

import type { Context, Result } from "../../src/contracts.ts";
import { runDelivery } from "../../src/handler.ts";
import { journalRelativePath } from "../../src/state.ts";
import type { Journal } from "../../src/state.ts";

export const identity = {
  name: "Fixture Author",
  email: "fixture@example.invalid",
};
export const command = {
  action: "commit",
  message: "Изолированное изменение fixture",
} as const;

/** Создаёт disposable Git-репозиторий с отключёнными внешними hooks и очисткой после теста. */
export async function createDeliveryFixture(
  t: TestContext,
  paths = ["owned.txt"],
) {
  const temporary = await mkdtemp(join(tmpdir(), "realize-git-handler-"));
  t.after(async () => {
    await rm(temporary, { recursive: true, force: true });
  });
  const root = join(temporary, "repository");
  const hooks = join(temporary, "hooks");
  await mkdir(root);
  await mkdir(hooks);
  const git = new FixtureGit(root);
  await git.run(["init", "--initial-branch=main"]);
  for (const [key, value] of Object.entries({
    "core.hooksPath": hooks,
    "commit.gpgSign": "false",
    "tag.gpgSign": "false",
    "core.autocrlf": "false",
    "core.safecrlf": "false",
    "core.fileMode": "true",
    "core.excludesFile": "/dev/null",
    "core.attributesFile": "/dev/null",
    "user.name": identity.name,
    "user.email": identity.email,
  }))
    await git.run(["config", "--local", key, value]);
  for (const [path, content] of Object.entries({
    ".gitignore": "/.ai-workspace/\n",
    "owned.txt": "owned baseline\n",
    "foreign.txt": "foreign baseline\n",
    "checks-config.json": "{}\n",
  }))
    await writeFile(join(root, path), content);
  await git.run(["add", "--all"]);
  await git.run(["commit", "--message", "Initial isolated fixture"]);
  const context: Context = {
    version: 1,
    requestId: "request-1",
    projectId: "fixture-project",
    taskId: "fixture-task",
    repositoryRoot: root,
    authorization: {
      actions: ["inspect", "commit", "push", "commit_push"],
      scope: { mode: "paths", paths },
    },
    identity: { ...identity },
    verification: {
      inputPaths: ["checks-config.json"],
      requiredChecks: ["fixture-review"],
      results: [],
    },
  };
  const head = async () => (await git.run(["rev-parse", "HEAD"])).trim();
  const index = () => readFile(join(root, ".git", "index"));
  const count = async () =>
    Number((await git.run(["rev-list", "--count", "HEAD"])).trim());
  const write = (path: string, value: string) =>
    writeFile(join(root, path), value);
  const journalPath = join(root, journalRelativePath(context));
  const journal = async (): Promise<Journal> =>
    JSON.parse(await readFile(journalPath, "utf8"));
  return {
    temporary,
    root,
    hooks,
    git,
    context,
    head,
    index,
    count,
    write,
    journalPath,
    journal,
  };
}

/** Привязывает синтетическую успешную проверку к фактическому inspect-снимку. */
export async function attest(context: Context): Promise<string> {
  const inspectionContext = { ...context };
  delete inspectionContext.recovery;
  const inspection = await runDelivery(
    { action: "inspect" },
    inspectionContext,
  );
  assert.equal(inspection.status, "succeeded", JSON.stringify(inspection));
  assert.match(inspection.fingerprint!, /^[a-f0-9]{64}$/u);
  context.verification!.results = [
    {
      id: "fixture-review",
      status: "passed",
      fingerprint: inspection.fingerprint!,
    },
  ];
  return inspection.fingerprint!;
}

export function blocked(result: Result, code: string): void {
  assert.equal(result.status, "blocked", JSON.stringify(result));
  assert.equal(result.errorCode, code);
  assert.equal(result.commitCreated, false);
}
