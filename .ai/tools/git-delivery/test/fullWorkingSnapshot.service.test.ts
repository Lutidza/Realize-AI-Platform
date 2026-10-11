/**
 * @file .ai/tools/git-delivery/test/fullWorkingSnapshot.service.test.ts
 * @version 1.0.0
 * @date 2026-10-11
 * @description Проверяет явное включение частичного индекса в полный рабочий снимок на disposable Git.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { parseContext, PolicyError } from "../src/contracts.ts";
import { runDelivery } from "../src/handler.ts";
import { hashGitCommitContext } from "../src/commit/hashGitCommitContext.util.ts";
import { verifyGitStagedContent } from "../src/commit/verifyGitStagedContent.adapter.ts";
import { inspectRepository } from "../src/repository.ts";
import { saveJournal } from "../src/state.ts";
import {
  attest,
  blocked,
  command,
  createDeliveryFixture as fixture,
} from "./fixtures/createDeliveryFixture.adapter.ts";

for (const status of ["MM", "AM"] as const) {
  for (const explicitlyIncluded of [false, true]) {
    test(`полный снимок ${status}: includePartialIndex ${explicitlyIncluded ? "разрешён" : "отсутствует"}`, async (t) => {
      const f = await fixture(t);
      const path = status === "MM" ? "owned.txt" : "new.txt";
      f.context.authorization.scope = explicitlyIncluded
        ? { mode: "all", includePartialIndex: true }
        : { mode: "all" };
      await f.write(path, "intermediate staged bytes\n");
      await f.git.run(["add", "--", path]);
      await f.write(path, "latest checked working bytes\n");
      const inspection = await runDelivery({ action: "inspect" }, f.context);
      assert.deepEqual(inspection.changes.items, [{ path, status }]);
      await attest(f.context);
      const before = { head: await f.head(), index: await f.index() };
      const result = await runDelivery(command, f.context);
      if (!explicitlyIncluded) {
        blocked(result, "partial_index");
        assert.deepEqual(await f.index(), before.index);
        assert.equal(await f.head(), before.head);
        assert.equal(
          await f.git.run(["show", `:${path}`]),
          "intermediate staged bytes\n",
        );
        return;
      }
      assert.equal(result.status, "succeeded", JSON.stringify(result));
      assert.equal(await f.count(), 2);
      assert.equal(
        await f.git.run(["show", `HEAD:${path}`]),
        "latest checked working bytes\n",
      );
      assert.equal(await f.git.run(["status", "--porcelain=v1"]), "");
      const repeated = await runDelivery(command, f.context);
      assert.equal(repeated.status, "noop", JSON.stringify(repeated));
      assert.equal(await f.count(), 2);
    });
  }
}

test("флаг принимается только как true в all и не назначается командой модели", async (t) => {
  const f = await fixture(t);
  for (const scope of [
    { mode: "all", includePartialIndex: false },
    { mode: "all", includePartialIndex: "true" },
    { mode: "all", includePartialIndex: 1 },
    { mode: "all", includePartialIndex: null },
    { mode: "all", includePartialIndex: undefined },
    { mode: "paths", paths: ["owned.txt"], includePartialIndex: true },
    { mode: "paths", paths: ["owned.txt"], includePartialIndex: false },
    { mode: "paths", paths: ["owned.txt"], includePartialIndex: undefined },
  ]) {
    assert.throws(
      () =>
        parseContext({
          ...f.context,
          authorization: { ...f.context.authorization, scope },
        }),
      (error: unknown) =>
        error instanceof PolicyError && error.code === "invalid_scope",
    );
  }
  const inheritedScope = Object.assign(
    Object.create({ includePartialIndex: true }),
    { mode: "all" },
  );
  assert.deepEqual(
    parseContext({
      ...f.context,
      authorization: { ...f.context.authorization, scope: inheritedScope },
    }).authorization.scope,
    { mode: "all" },
  );
  blocked(
    await runDelivery({ ...command, includePartialIndex: true }, f.context),
    "invalid_input",
  );
});

test("добавление флага к существующему журналу не расширяет разрешение", async (t) => {
  const f = await fixture(t);
  f.context.authorization.scope = { mode: "all" };
  await attest(f.context);
  assert.equal((await runDelivery(command, f.context)).status, "noop");
  await f.write("owned.txt", "new change after completed request\n");
  await f.git.run(["add", "--", "owned.txt"]);
  await f.write("owned.txt", "working change after completed request\n");
  f.context.authorization.scope = { mode: "all", includePartialIndex: true };
  await attest(f.context);
  const before = await f.index();
  blocked(await runDelivery(command, f.context), "request_conflict");
  assert.deepEqual(await f.index(), before);
  assert.equal(await f.count(), 1);
});

test("восстановление полного частичного снимка сохраняет scope и повторяемость", async (t) => {
  const f = await fixture(t);
  f.context.authorization.scope = { mode: "all", includePartialIndex: true };
  await f.write("owned.txt", "intermediate staged bytes\n");
  await f.git.run(["add", "--", "owned.txt"]);
  const syntheticToken = ["ghp", "_", "a".repeat(36)].join("");
  await f.write("owned.txt", syntheticToken);
  await attest(f.context);
  const rejected = await runDelivery(command, f.context);
  assert.equal(rejected.errorCode, "secret_detected");
  const journal = await f.journal();
  assert.equal(journal.preparedTree, undefined);
  await f.write("owned.txt", "corrected checked working bytes\n");
  f.context.recovery = {
    attempt: 1,
    previousFingerprint: journal.original.fingerprint,
  };
  await attest(f.context);
  const result = await runDelivery(command, f.context);
  assert.equal(result.status, "succeeded", JSON.stringify(result));
  assert.equal(result.recoveryAttempts, 1);
  assert.equal(
    await f.git.run(["show", "HEAD:owned.txt"]),
    "corrected checked working bytes\n",
  );
  assert.equal((await runDelivery(command, f.context)).status, "noop");
  assert.equal(await f.count(), 2);
});

test("полный снимок не снимает защиту от устаревших проверок", async (t) => {
  const f = await fixture(t);
  f.context.authorization.scope = { mode: "all", includePartialIndex: true };
  await f.write("owned.txt", "intermediate staged bytes\n");
  await f.git.run(["add", "--", "owned.txt"]);
  await f.write("owned.txt", "checked working bytes\n");
  await attest(f.context);
  await f.write("owned.txt", "unverified later bytes\n");
  const before = await f.index();
  blocked(await runDelivery(command, f.context), "checks_stale_or_missing");
  assert.deepEqual(await f.index(), before);
  assert.equal(await f.count(), 1);
});

test("полный снимок включает возврат staged-файла к HEAD без лишнего diff-пути", async (t) => {
  const f = await fixture(t);
  f.context.authorization.scope = { mode: "all", includePartialIndex: true };
  await f.write("owned.txt", "intermediate staged bytes\n");
  await f.git.run(["add", "--", "owned.txt"]);
  await f.write("owned.txt", "owned baseline\n");
  await f.write("foreign.txt", "checked net change\n");
  await attest(f.context);
  const result = await runDelivery(command, f.context);
  assert.equal(result.status, "succeeded", JSON.stringify(result));
  assert.equal(await f.git.run(["show", "HEAD:owned.txt"]), "owned baseline\n");
  assert.equal(
    await f.git.run(["show", "HEAD:foreign.txt"]),
    "checked net change\n",
  );
  assert.equal(
    await f.git.run([
      "diff-tree",
      "--no-commit-id",
      "--name-only",
      "-r",
      "HEAD",
    ]),
    "foreign.txt\n",
  );
  assert.equal((await runDelivery(command, f.context)).status, "noop");
  assert.equal(await f.count(), 2);
});

test("проверка полного снимка отвергает пропущенные из staging рабочие bytes", async (t) => {
  const f = await fixture(t);
  await f.write("owned.txt", "checked pending working bytes\n");
  const snapshot = await inspectRepository(f.git, { mode: "all" }, []);
  await assert.rejects(
    verifyGitStagedContent(f.git, snapshot, ["owned.txt"], undefined, true),
    (error: unknown) =>
      error instanceof PolicyError && error.code === "staged_content_changed",
  );
  assert.equal(await f.git.run(["show", ":owned.txt"]), "owned baseline\n");
});

test("проверка полного снимка отвергает staged-путь вне принятого снимка", async (t) => {
  const f = await fixture(t);
  await f.write("owned.txt", "checked pending working bytes\n");
  const snapshot = await inspectRepository(f.git, { mode: "all" }, []);
  await f.write("foreign.txt", "later foreign staged bytes\n");
  await f.git.run(["add", "--", "owned.txt", "foreign.txt"]);
  const before = await f.index();
  await assert.rejects(
    verifyGitStagedContent(f.git, snapshot, ["owned.txt"], undefined, true),
    (error: unknown) =>
      error instanceof PolicyError && error.code === "foreign_index",
  );
  assert.deepEqual(await f.index(), before);
});

test("recovery сохраняет владение прежним staging после исчезновения diff-пути HEAD", async (t) => {
  const f = await fixture(t);
  f.context.authorization.scope = { mode: "all", includePartialIndex: true };
  await f.write("owned.txt", "intermediate staged bytes\n");
  await f.git.run(["add", "--", "owned.txt"]);
  await f.write("owned.txt", "owned baseline\n");
  await f.write("foreign.txt", "original checked bytes\n");
  await attest(f.context);
  const original = await inspectRepository(
    f.git,
    f.context.authorization.scope,
    f.context.verification!.inputPaths,
  );
  const paths = original.changes.map(({ path }) => path);
  // Воспроизводит журнал прежнего обработчика, остановившегося после add до preparedTree.
  await saveJournal(f.context, {
    version: 1,
    binding: hashGitCommitContext(command, f.context),
    original,
    paths,
  });
  await f.git.run(["add", "--", ...paths]);
  assert.equal(
    await f.git.run(["diff", "--cached", "--name-only"]),
    "foreign.txt\n",
  );
  await f.write("foreign.txt", "corrected checked bytes\n");
  f.context.recovery = {
    attempt: 1,
    previousFingerprint: original.fingerprint,
  };
  await attest(f.context);
  const result = await runDelivery(command, f.context);
  assert.equal(result.status, "succeeded", JSON.stringify(result));
  assert.equal(result.recoveryAttempts, 1);
  assert.equal(await f.git.run(["show", "HEAD:owned.txt"]), "owned baseline\n");
  assert.equal(
    await f.git.run(["show", "HEAD:foreign.txt"]),
    "corrected checked bytes\n",
  );
  assert.equal((await runDelivery(command, f.context)).status, "noop");
  assert.equal(await f.count(), 2);
});
