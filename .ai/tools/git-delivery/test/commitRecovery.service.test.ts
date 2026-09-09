/**
 * @file .ai/tools/git-delivery/test/commitRecovery.service.test.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Проверяет восстановление незавершённого commit по поколениям журнала на disposable Git.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import type { Command, Context } from "../src/contracts.ts";
import { runDelivery } from "../src/handler.ts";
import { inspectRepository } from "../src/repository.ts";
import { saveJournal } from "../src/state.ts";
import type { Journal } from "../src/state.ts";
import {
  attest,
  blocked,
  command,
  createDeliveryFixture as fixture,
} from "./fixtures/createDeliveryFixture.adapter.ts";

const syntheticTokens = [
  ["ghp", "_", "a".repeat(36)].join(""),
  ["AKIA", "Z".repeat(16)].join(""),
];

/** Воспроизводит прежний durable журнал после secret_detected, включая прежний binding без recovery. */
async function legacyJournal(f: Awaited<ReturnType<typeof fixture>>) {
  const context = f.context;
  const original = await inspectRepository(
    f.git,
    context.authorization.scope,
    context.verification!.inputPaths,
  );
  // Формат до recovery фиксирован здесь независимо от нового production binding.
  const binding = createHash("sha256")
    .update(
      JSON.stringify({
        command,
        version: 1,
        requestId: context.requestId,
        projectId: context.projectId,
        taskId: context.taskId,
        repositoryRoot: context.repositoryRoot,
        authorization: context.authorization,
        identity: context.identity,
        verification: {
          inputPaths: context.verification!.inputPaths,
          requiredChecks: context.verification!.requiredChecks,
        },
      }),
    )
    .digest("hex");
  const journal: Journal = {
    version: 1,
    binding,
    original,
    paths: original.changes.map(({ path }) => path),
  };
  await saveJournal(context, journal);
  await f.git.run(["add", "--", ...journal.paths]);
  return journal;
}

async function recover(context: Context, journal: Journal, attempt = 1) {
  context.recovery = {
    attempt,
    previousFingerprint:
      journal.recovery?.snapshot.fingerprint ?? journal.original.fingerprint,
  };
  return await attest(context);
}

async function interrupt(context: Context, phase: "before-add" | "after-add") {
  const result = await new Promise<{
    signal: string | null;
    stdout: string;
    stderr: string;
  }>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        "--import",
        import.meta.resolve("tsx"),
        fileURLToPath(
          new URL(
            "./fixtures/runInterruptedCommit.controller.ts",
            import.meta.url,
          ),
        ),
      ],
      { cwd: context.repositoryRoot, stdio: "pipe", timeout: 30_000 },
    );
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.once("error", reject);
    child.once("close", (_code, signal) =>
      resolve({
        signal,
        stdout: Buffer.concat(stdout).toString(),
        stderr: Buffer.concat(stderr).toString(),
      }),
    );
    child.stdin.end(JSON.stringify({ command, context, phase }));
  });
  assert.equal(result.signal, "SIGKILL", JSON.stringify(result));
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "");
}

async function assertRejectedWithoutMutation(
  f: Awaited<ReturnType<typeof fixture>>,
  code: string,
  input: Command = command,
) {
  const before = {
    head: await f.head(),
    index: await f.index(),
    journal: await readFile(f.journalPath),
  };
  const result = await runDelivery(input, f.context);
  blocked(result, code);
  assert.equal(await f.head(), before.head);
  assert.deepEqual(await f.index(), before.index);
  assert.deepEqual(await readFile(f.journalPath), before.journal);
  return result;
}

test("recovery исправляет два синтетических секрета из legacy staging, сохраняя original и чужие файлы", async (t) => {
  const f = await fixture(t, ["owned.txt", "second.txt"]);
  for (const [index, path] of ["owned.txt", "second.txt"].entries())
    await f.write(path, `synthetic fixture ${syntheticTokens[index]}\n`);
  await attest(f.context);
  const original = await legacyJournal(f);
  await f.write("owned.txt", "first repaired content\n");
  await f.write("second.txt", "second repaired content\n");
  await f.write("foreign.txt", "foreign unstaged decision\n");
  await f.write("unrelated.txt", "foreign untracked decision\n");
  const checkedFingerprint = await recover(f.context, original);
  const result = await runDelivery(command, f.context);
  assert.equal(result.status, "succeeded", JSON.stringify(result));
  assert.equal(result.recoveryAttempts, 1);
  assert.equal(result.fingerprint, checkedFingerprint);
  assert.equal(await f.count(), 2);
  assert.equal(
    await f.git.run(["show", "HEAD:owned.txt"]),
    "first repaired content\n",
  );
  assert.equal(
    await f.git.run(["show", "HEAD:second.txt"]),
    "second repaired content\n",
  );
  assert.equal(
    await f.git.run(["show", "HEAD:foreign.txt"]),
    "foreign baseline\n",
  );
  assert.equal(
    await readFile(join(f.root, "foreign.txt"), "utf8"),
    "foreign unstaged decision\n",
  );
  assert.equal(
    await readFile(join(f.root, "unrelated.txt"), "utf8"),
    "foreign untracked decision\n",
  );
  const journal = await f.journal();
  assert.deepEqual(journal.original, original.original);
  assert.deepEqual(journal.paths, original.paths);
  assert.equal(journal.binding, original.binding);
  assert.equal(journal.recovery?.snapshot.fingerprint, checkedFingerprint);
  for (const token of syntheticTokens) {
    assert.equal(JSON.stringify(journal).includes(token), false);
    assert.equal(JSON.stringify(result).includes(token), false);
  }
  const repeated = await runDelivery(command, f.context);
  assert.equal(repeated.status, "noop", JSON.stringify(repeated));
  assert.equal(repeated.recoveryAttempts, 1);
  assert.equal(repeated.commit, result.commit);
  assert.equal(await f.count(), 2);
  delete journal.commit;
  await writeFile(f.journalPath, JSON.stringify(journal));
  const recoveredCommit = await runDelivery(command, f.context);
  assert.equal(recoveredCommit.status, "noop", JSON.stringify(recoveredCommit));
  assert.equal(recoveredCommit.commit, result.commit);
  assert.equal(recoveredCommit.recoveryAttempts, 1);
  assert.equal(await f.count(), 2);
});

test("свежие checks без recovery не заменяют исходный снимок legacy request", async (t) => {
  const f = await fixture(t);
  await f.write("owned.txt", "original checked content\n");
  await attest(f.context);
  await legacyJournal(f);
  await f.write("owned.txt", "changed content\n");
  await attest(f.context);
  await assertRejectedWithoutMutation(f, "repository_changed");
});

test("recovery со старыми, отсутствующими или failed checks не принимает поколение", async (t) => {
  for (const evidence of ["stale", "missing", "failed"] as const) {
    await t.test(evidence, async (child) => {
      const f = await fixture(child);
      await f.write("owned.txt", "original checked content\n");
      await attest(f.context);
      const original = await legacyJournal(f);
      await f.write("owned.txt", "repaired content\n");
      f.context.recovery = {
        attempt: 1,
        previousFingerprint: original.original.fingerprint,
      };
      if (evidence === "missing") f.context.verification!.results = [];
      if (evidence === "failed") {
        await attest(f.context);
        f.context.verification!.results[0]!.status = "failed";
      }
      const result = await assertRejectedWithoutMutation(
        f,
        "checks_stale_or_missing",
      );
      assert.equal(result.recoveryAttempts, 0);
    });
  }
});

test("recovery не ослабляет детектор при исправлении только одного из двух секретов", async (t) => {
  const f = await fixture(t, ["owned.txt", "second.txt"]);
  await f.write("owned.txt", `synthetic ${syntheticTokens[0]}\n`);
  await f.write("second.txt", `synthetic ${syntheticTokens[1]}\n`);
  await attest(f.context);
  const original = await legacyJournal(f);
  await f.write("owned.txt", "first repaired\n");
  await recover(f.context, original);
  const before = await f.index();
  const result = await runDelivery(command, f.context);
  assert.equal(result.errorCode, "secret_detected", JSON.stringify(result));
  assert.equal(result.status, "partial");
  assert.equal(result.commitCreated, false);
  assert.equal(result.recoveryAttempts, 1);
  assert.deepEqual(await f.index(), before);
  assert.equal(await f.count(), 1);
  assert.deepEqual((await f.journal()).original, original.original);
  for (const token of syntheticTokens) {
    assert.equal(JSON.stringify(result).includes(token), false);
    assert.equal(
      (await readFile(f.journalPath, "utf8")).includes(token),
      false,
    );
  }
  await f.write("second.txt", "second repaired\n");
  await recover(f.context, await f.journal(), 2);
  const completed = await runDelivery(command, f.context);
  assert.equal(completed.status, "succeeded", JSON.stringify(completed));
  assert.equal(completed.recoveryAttempts, 2);
  assert.equal(await f.git.run(["show", "HEAD:owned.txt"]), "first repaired\n");
  assert.equal(
    await f.git.run(["show", "HEAD:second.txt"]),
    "second repaired\n",
  );
  assert.deepEqual((await f.journal()).original, original.original);
  assert.equal(await f.count(), 2);
});

test("recovery с неверным номером или предыдущим fingerprint не изменяет journal и индекс", async (t) => {
  for (const invalid of ["skipped-attempt", "wrong-fingerprint"] as const) {
    await t.test(invalid, async (child) => {
      const f = await fixture(child);
      await f.write("owned.txt", "before recovery\n");
      const original = await legacyJournal(f);
      await f.write("owned.txt", "after recovery\n");
      await recover(f.context, original);
      if (invalid === "skipped-attempt") f.context.recovery!.attempt = 2;
      else f.context.recovery!.previousFingerprint = "0".repeat(64);
      await assertRejectedWithoutMutation(f, "commit_recovery_conflict");
    });
  }
});

test("recovery сохраняет чужой staged и частичный индекс нового разрешённого пути", async (t) => {
  for (const indexCase of [
    "foreign-staged",
    "new-partial-path",
    "replaced-owned-staging",
  ] as const) {
    await t.test(indexCase, async (child) => {
      const f = await fixture(
        child,
        indexCase === "new-partial-path"
          ? ["owned.txt", "foreign.txt"]
          : undefined,
      );
      await f.write("owned.txt", "original staged decision\n");
      const original = await legacyJournal(f);
      if (indexCase === "replaced-owned-staging") {
        await f.write("owned.txt", "unrelated staged choice\n");
        await f.git.run(["add", "--", "owned.txt"]);
      } else {
        await f.write("foreign.txt", "foreign staged choice\n");
        await f.git.run(["add", "--", "foreign.txt"]);
        if (indexCase === "new-partial-path")
          await f.write("foreign.txt", "foreign unstaged choice\n");
      }
      await f.write("owned.txt", "repaired checked content\n");
      await recover(f.context, original);
      await assertRejectedWithoutMutation(f, "index_changed");
      assert.equal(await f.count(), 1);
      if (indexCase === "new-partial-path") {
        assert.equal(
          await f.git.run(["show", ":foreign.txt"]),
          "foreign staged choice\n",
        );
        assert.equal(
          await readFile(join(f.root, "foreign.txt"), "utf8"),
          "foreign unstaged choice\n",
        );
      }
    });
  }
});

test("recovery не разрешает исходный partial index до создания журнала", async (t) => {
  const f = await fixture(t);
  await f.write("owned.txt", "original staged content\n");
  await f.git.run(["add", "--", "owned.txt"]);
  await f.write("owned.txt", "unstaged content\n");
  const fingerprint = await attest(f.context);
  const before = await f.index();
  blocked(await runDelivery(command, f.context), "partial_index");
  f.context.recovery = { attempt: 1, previousFingerprint: fingerprint };
  blocked(await runDelivery(command, f.context), "commit_recovery_unavailable");
  assert.deepEqual(await f.index(), before);
  assert.equal(await f.count(), 1);
  await assert.rejects(readFile(f.journalPath), { code: "ENOENT" });
});

test("recovery требует существующего незавершённого журнала", async (t) => {
  const f = await fixture(t);
  await f.write("owned.txt", "new request\n");
  const fingerprint = await attest(f.context);
  f.context.recovery = { attempt: 1, previousFingerprint: fingerprint };
  const before = await f.index();
  blocked(await runDelivery(command, f.context), "commit_recovery_unavailable");
  assert.deepEqual(await f.index(), before);
  assert.equal(await f.count(), 1);
  await assert.rejects(readFile(f.journalPath), { code: "ENOENT" });
});

test("recovery сохраняет неизменными авторство, сообщение, authorization и selectors проверок", async (t) => {
  for (const changed of [
    "identity",
    "message",
    "scope",
    "actions",
    "inputPaths",
    "requiredChecks",
  ] as const) {
    await t.test(changed, async (child) => {
      const f = await fixture(child);
      await f.write("owned.txt", "original checked\n");
      const original = await legacyJournal(f);
      await f.write("owned.txt", "repaired checked\n");
      await recover(f.context, original);
      let input: { action: "commit"; message: string } = command;
      if (changed === "identity")
        f.context.identity!.email = "different@example.invalid";
      if (changed === "message")
        input = { ...command, message: "Другой смысл commit" };
      if (changed === "scope") f.context.authorization.scope = { mode: "all" };
      if (changed === "actions")
        f.context.authorization.actions = ["inspect", "commit"];
      if (changed === "inputPaths") f.context.verification!.inputPaths = [];
      if (changed === "requiredChecks")
        f.context.verification!.requiredChecks = ["different-review"];
      await assertRejectedWithoutMutation(f, "request_conflict", input);
    });
  }
});

test("recovery без разрешённого commit останавливается до journal и staging", async (t) => {
  const f = await fixture(t);
  await f.write("owned.txt", "before recovery\n");
  const original = await legacyJournal(f);
  await f.write("owned.txt", "after recovery\n");
  await recover(f.context, original);
  f.context.authorization.actions = ["inspect"];
  await assertRejectedWithoutMutation(f, "commit_recovery_invalid");
});

test("recovery блокируется после смены ветки или HEAD", async (t) => {
  for (const changed of ["branch", "head"] as const) {
    await t.test(changed, async (child) => {
      const f = await fixture(child);
      await f.write("owned.txt", "before recovery\n");
      const original = await legacyJournal(f);
      await f.write("owned.txt", "after recovery\n");
      if (changed === "branch") await f.git.run(["branch", "--move", "other"]);
      else {
        const tree = (await f.git.run(["rev-parse", "HEAD^{tree}"])).trim();
        const head = (
          await f.git.run(["commit-tree", tree, "-p", await f.head()], {
            input: "Independent fixture commit\n",
          })
        ).trim();
        await f.git.run(["update-ref", "HEAD", head]);
      }
      await recover(f.context, original);
      await assertRejectedWithoutMutation(
        f,
        changed === "head" ? "recovery_conflict" : "repository_changed",
      );
    });
  }
});

test("recovery переживает SIGKILL до и после add без замены поколения или дубля commit", async (t) => {
  for (const phase of ["before-add", "after-add"] as const) {
    await t.test(phase, async (child) => {
      const f = await fixture(child);
      await f.write("owned.txt", `synthetic ${syntheticTokens[0]}\n`);
      const original = await legacyJournal(f);
      const originalIndex = await f.index();
      await f.write("owned.txt", "repaired before process interruption\n");
      const checkedFingerprint = await recover(f.context, original);
      await interrupt(f.context, phase);
      const interrupted = await f.journal();
      assert.equal(interrupted.preparedTree, undefined);
      assert.equal(interrupted.commit, undefined);
      assert.deepEqual(interrupted.original, original.original);
      assert.deepEqual(interrupted.paths, original.paths);
      assert.equal(interrupted.recovery?.attempt, 1);
      assert.equal(
        interrupted.recovery?.previousFingerprint,
        original.original.fingerprint,
      );
      assert.equal(
        interrupted.recovery?.snapshot.fingerprint,
        checkedFingerprint,
      );
      if (phase === "before-add")
        assert.deepEqual(await f.index(), originalIndex);
      else
        assert.equal(
          await f.git.run(["show", ":owned.txt"]),
          "repaired before process interruption\n",
        );
      assert.equal(await f.count(), 1);
      const result = await runDelivery(command, f.context);
      assert.equal(result.status, "succeeded", JSON.stringify(result));
      assert.equal(result.recoveryAttempts, 1);
      assert.deepEqual((await f.journal()).recovery, interrupted.recovery);
      assert.equal(
        await f.git.run(["show", "HEAD:owned.txt"]),
        "repaired before process interruption\n",
      );
      const repeated = await runDelivery(command, f.context);
      assert.equal(repeated.status, "noop", JSON.stringify(repeated));
      assert.equal(repeated.commit, result.commit);
      assert.equal(repeated.recoveryAttempts, 1);
      assert.equal(await f.count(), 2);
    });
  }
});

test("следующее поколение ссылается на принятый снимок и сохраняет immutable original", async (t) => {
  const f = await fixture(t);
  await f.write("owned.txt", "original content\n");
  const original = await legacyJournal(f);
  await f.write("owned.txt", "first recovery content\n");
  await recover(f.context, original);
  await interrupt(f.context, "after-add");
  const firstRecovery = await f.journal();
  await f.write("owned.txt", "second recovery content\n");
  await recover(f.context, firstRecovery, 2);
  const result = await runDelivery(command, f.context);
  assert.equal(result.status, "succeeded", JSON.stringify(result));
  assert.equal(result.recoveryAttempts, 2);
  assert.equal(
    await f.git.run(["show", "HEAD:owned.txt"]),
    "second recovery content\n",
  );
  const journal = await f.journal();
  assert.deepEqual(journal.original, original.original);
  assert.deepEqual(journal.paths, original.paths);
  assert.equal(
    journal.recovery?.previousFingerprint,
    firstRecovery.recovery?.snapshot.fingerprint,
  );
  assert.equal(journal.recovery?.attempt, 2);
  assert.equal(await f.count(), 2);
});

test("recovery принимает сохранённый исходный индекс после SIGKILL первого commit до add", async (t) => {
  const f = await fixture(t);
  await f.write("owned.txt", "first checked content\n");
  await attest(f.context);
  const before = await f.index();
  await interrupt(f.context, "before-add");
  assert.deepEqual(await f.index(), before);
  const original = await f.journal();
  assert.equal(original.recovery, undefined);
  await f.write("owned.txt", "recovery checked content\n");
  await recover(f.context, original);
  const result = await runDelivery(command, f.context);
  assert.equal(result.status, "succeeded", JSON.stringify(result));
  assert.equal(result.recoveryAttempts, 1);
  assert.equal(
    await f.git.run(["show", "HEAD:owned.txt"]),
    "recovery checked content\n",
  );
  assert.deepEqual((await f.journal()).original, original.original);
  assert.equal(await f.count(), 2);
});

test("целостный подменённый recovery snapshot вне authorization.scope сохраняет чужие файлы", async (t) => {
  const f = await fixture(t);
  await f.write("owned.txt", "original content\n");
  const original = await legacyJournal(f);
  await f.write("owned.txt", "accepted recovery content\n");
  await recover(f.context, original);
  await interrupt(f.context, "before-add");
  await f.write("foreign.txt", "foreign decision\n");
  const journal = await f.journal();
  journal.recovery!.snapshot = await inspectRepository(
    f.git,
    { mode: "all" },
    f.context.verification!.inputPaths,
  );
  await writeFile(f.journalPath, JSON.stringify(journal));
  await assertRejectedWithoutMutation(f, "request_conflict");
  assert.equal(
    await readFile(join(f.root, "foreign.txt"), "utf8"),
    "foreign decision\n",
  );
  assert.equal(await f.git.run(["show", ":foreign.txt"]), "foreign baseline\n");
});

test("принятый recovery требует явного продолжения и evidence того же снимка", async (t) => {
  for (const omitted of ["recovery", "evidence"] as const) {
    await t.test(omitted, async (child) => {
      const f = await fixture(child);
      await f.write("owned.txt", "original content\n");
      const original = await legacyJournal(f);
      await f.write("owned.txt", "accepted recovery content\n");
      await recover(f.context, original);
      await interrupt(f.context, "before-add");
      if (omitted === "recovery") delete f.context.recovery;
      else
        f.context.verification!.results[0]!.fingerprint =
          original.original.fingerprint;
      const result = await assertRejectedWithoutMutation(
        f,
        omitted === "recovery"
          ? "commit_recovery_required"
          : "checks_stale_or_missing",
      );
      assert.equal(result.recoveryAttempts, 1);
    });
  }
});

test("тот же принятый attempt не принимает другие bytes или другой previousFingerprint", async (t) => {
  for (const changed of ["content", "previousFingerprint"] as const) {
    await t.test(changed, async (child) => {
      const f = await fixture(child);
      await f.write("owned.txt", "original content\n");
      const original = await legacyJournal(f);
      await f.write("owned.txt", "accepted recovery content\n");
      await recover(f.context, original);
      await interrupt(f.context, "before-add");
      if (changed === "content") {
        await f.write("owned.txt", "different recovery content\n");
      } else f.context.recovery!.previousFingerprint = "0".repeat(64);
      await assertRejectedWithoutMutation(
        f,
        changed === "content"
          ? "repository_changed"
          : "commit_recovery_conflict",
      );
    });
  }
});

test("повреждённый recovery в journal блокируется до изменения Git", async (t) => {
  for (const corruption of [
    "attempt-zero",
    "attempt-fraction",
    "attempt-over-limit",
    "previousFingerprint",
    "snapshot-fingerprint",
    "missing-snapshot",
    "unknown-field",
  ] as const) {
    await t.test(corruption, async (child) => {
      const f = await fixture(child);
      await f.write("owned.txt", "original content\n");
      const original = await legacyJournal(f);
      await f.write("owned.txt", "accepted recovery content\n");
      await recover(f.context, original);
      await interrupt(f.context, "before-add");
      const damaged = JSON.parse(await readFile(f.journalPath, "utf8"));
      if (corruption === "attempt-zero") damaged.recovery.attempt = 0;
      if (corruption === "attempt-fraction") damaged.recovery.attempt = 1.5;
      if (corruption === "attempt-over-limit") damaged.recovery.attempt = 17;
      if (corruption === "previousFingerprint")
        damaged.recovery.previousFingerprint = "invalid";
      if (corruption === "snapshot-fingerprint")
        damaged.recovery.snapshot.fingerprint = "0".repeat(64);
      if (corruption === "missing-snapshot") delete damaged.recovery.snapshot;
      if (corruption === "unknown-field") damaged.recovery.unexpected = true;
      await writeFile(f.journalPath, JSON.stringify(damaged));
      await assertRejectedWithoutMutation(f, "invalid_journal");
    });
  }
});

test("recovery не заменяет preparedTree после ошибки hook", async (t) => {
  const f = await fixture(t);
  await f.write("owned.txt", "hook protected content\n");
  const hook = join(f.hooks, "pre-commit");
  await writeFile(hook, "#!/bin/sh\nexit 17\n", { mode: 0o700 });
  await attest(f.context);
  const failed = await runDelivery(command, f.context);
  assert.equal(failed.errorCode, "git_command_failed", JSON.stringify(failed));
  const prepared = await f.journal();
  assert.ok(prepared.preparedTree);
  await rm(hook);
  await f.write("owned.txt", "replacement after hook failure\n");
  await recover(f.context, prepared);
  await assertRejectedWithoutMutation(f, "commit_recovery_unavailable");
  assert.equal(
    await f.git.run(["show", ":owned.txt"]),
    "hook protected content\n",
  );
  assert.equal(await f.count(), 1);
});

test("завершённый noop не принимает recovery, а созданный commit возвращает прежний noop", async (t) => {
  for (const completed of ["noop", "commit"] as const) {
    await t.test(completed, async (child) => {
      const f = await fixture(child);
      if (completed === "commit")
        await f.write("owned.txt", "completed content\n");
      await attest(f.context);
      const first = await runDelivery(command, f.context);
      assert.equal(
        first.status,
        completed === "noop" ? "noop" : "succeeded",
        JSON.stringify(first),
      );
      const journal = await f.journal();
      await f.write("owned.txt", "later unrelated content\n");
      await recover(f.context, journal);
      if (completed === "noop")
        await assertRejectedWithoutMutation(f, "commit_recovery_unavailable");
      else {
        const before = await f.index();
        const repeated = await runDelivery(command, f.context);
        assert.equal(repeated.status, "noop", JSON.stringify(repeated));
        assert.equal(repeated.commit, first.commit);
        assert.equal(repeated.recoveryAttempts, 0);
        assert.deepEqual(await f.index(), before);
        assert.equal(await f.count(), 2);
      }
    });
  }
});
