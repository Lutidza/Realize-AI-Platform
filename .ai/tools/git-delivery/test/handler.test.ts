/** Реальный Git запускается только в mkdtemp fixtures; проверки моделируют доверенные attestations launcher. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { TestContext } from "node:test";
import { fileURLToPath } from "node:url";

import type { Context, Result } from "../src/contracts.ts";
import { Git } from "../src/git.ts";
import { runDelivery } from "../src/handler.ts";
import { journalRelativePath } from "../src/state.ts";
import type { Journal } from "../src/state.ts";

const identity = { name: "Fixture Author", email: "fixture@example.invalid" };
const command = {
  action: "commit",
  message: "Изолированное изменение fixture",
} as const;

async function fixture(t: TestContext, paths = ["owned.txt"]) {
  const temporary = await mkdtemp(join(tmpdir(), "realize-git-handler-"));
  t.after(async () => {
    await rm(temporary, { recursive: true, force: true });
  });
  const root = join(temporary, "repository");
  const hooks = join(temporary, "hooks");
  await mkdir(root);
  await mkdir(hooks);
  const git = new Git(root);
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
    identity,
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

async function attest(context: Context): Promise<string> {
  const inspection = await runDelivery({ action: "inspect" }, context);
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

function blocked(result: Result, code: string): void {
  assert.equal(result.status, "blocked", JSON.stringify(result));
  assert.equal(result.errorCode, code);
  assert.equal(result.commitCreated, false);
}

test("inspect сохраняет байты индекса, HEAD и рабочие файлы", async (t) => {
  const f = await fixture(t);
  await f.write("owned.txt", "owned inspected\n");
  await f.write("foreign.txt", "foreign staged\n");
  await f.git.run(["add", "--", "foreign.txt"]);
  const before = { index: await f.index(), head: await f.head() };
  const result = await runDelivery({ action: "inspect" }, f.context);
  assert.equal(result.status, "succeeded", JSON.stringify(result));
  assert.deepEqual(result.changes.items, [{ path: "owned.txt", status: " M" }]);
  assert.deepEqual(await f.index(), before.index);
  assert.equal(await f.head(), before.head);
  assert.equal(
    await readFile(join(f.root, "owned.txt"), "utf8"),
    "owned inspected\n",
  );
  assert.equal(
    await readFile(join(f.root, "foreign.txt"), "utf8"),
    "foreign staged\n",
  );
  await assert.rejects(readFile(f.journalPath), { code: "ENOENT" });
});

test("scoped commit сохраняет чужую unstaged правку и заданное авторство", async (t) => {
  const f = await fixture(t);
  await f.write("owned.txt", "owned committed\n");
  await f.write("foreign.txt", "foreign pending\n");
  await attest(f.context);
  const result = await runDelivery(command, f.context);
  assert.equal(result.status, "succeeded", JSON.stringify(result));
  assert.equal(result.commitCreated, true);
  assert.equal(result.commit, await f.head());
  assert.deepEqual(result.checks, [
    { id: "fixture-review", status: "passed", reused: true },
  ]);
  assert.equal(
    await f.git.run(["show", "HEAD:owned.txt"]),
    "owned committed\n",
  );
  assert.equal(
    await f.git.run(["show", "HEAD:foreign.txt"]),
    "foreign baseline\n",
  );
  assert.equal(
    await readFile(join(f.root, "foreign.txt"), "utf8"),
    "foreign pending\n",
  );
  assert.equal(await f.git.run(["diff", "--cached", "--name-only"]), "");
  assert.equal(
    await f.git.run(["show", "--no-patch", "--format=%an|%ae|%cn|%ce", "HEAD"]),
    `${identity.name}|${identity.email}|${identity.name}|${identity.email}\n`,
  );
  const journal = await f.journal();
  assert.equal(journal.commit, result.commit);
  assert.equal(
    journal.preparedTree,
    (await f.git.run(["rev-parse", "HEAD^{tree}"])).trim(),
  );
  assert.deepEqual(journal.result, result);
});

test("полностью staged файл и удаление разрешённого файла создают проверенный commit", async (t) => {
  for (const mode of ["staged", "deleted"] as const) {
    await t.test(mode, async (child) => {
      const f = await fixture(child);
      if (mode === "staged") {
        await f.write("owned.txt", "fully staged checked content\n");
        await f.git.run(["add", "--", "owned.txt"]);
      } else {
        await rm(join(f.root, "owned.txt"));
      }
      await attest(f.context);
      const result = await runDelivery(command, f.context);
      assert.equal(result.status, "succeeded", JSON.stringify(result));
      assert.equal(result.commitCreated, true);
      assert.equal(await f.count(), 2);
      assert.equal(await f.git.run(["diff", "--cached", "--name-only"]), "");
      assert.equal(
        await f.git.run([
          "diff-tree",
          "--no-commit-id",
          "--name-only",
          "-r",
          "HEAD",
        ]),
        "owned.txt\n",
      );
      if (mode === "staged") {
        assert.equal(
          await f.git.run(["show", "HEAD:owned.txt"]),
          "fully staged checked content\n",
        );
      } else {
        assert.equal(
          await f.git.run([
            "ls-tree",
            "--name-only",
            "HEAD",
            "--",
            "owned.txt",
          ]),
          "",
        );
      }
      assert.equal(
        await f.git.run(["show", "HEAD:foreign.txt"]),
        "foreign baseline\n",
      );
    });
  }
});

test("чужой staged файл блокирует commit и сохраняет исходный индекс", async (t) => {
  const f = await fixture(t);
  await f.write("owned.txt", "owned pending\n");
  await f.write("foreign.txt", "foreign staged\n");
  await f.git.run(["add", "--", "foreign.txt"]);
  await attest(f.context);
  const before = { head: await f.head(), index: await f.index() };
  blocked(await runDelivery(command, f.context), "foreign_index");
  assert.deepEqual(await f.index(), before.index);
  assert.equal(await f.head(), before.head);
});

test("частично staged разрешённый файл не перезаписывается", async (t) => {
  const f = await fixture(t);
  await f.write("owned.txt", "staged version\n");
  await f.git.run(["add", "--", "owned.txt"]);
  await f.write("owned.txt", "unstaged version\n");
  await attest(f.context);
  const before = await f.index();
  blocked(await runDelivery(command, f.context), "partial_index");
  assert.deepEqual(await f.index(), before);
  assert.equal(await f.git.run(["show", ":owned.txt"]), "staged version\n");
  assert.equal(
    await readFile(join(f.root, "owned.txt"), "utf8"),
    "unstaged version\n",
  );
  assert.equal(await f.count(), 1);
});

test("staged deletion и новый файл по тому же пути сохраняются как частичный индекс", async (t) => {
  const f = await fixture(t);
  await f.git.run(["rm", "--", "owned.txt"]);
  await f.write("owned.txt", "recreated outside index\n");
  await attest(f.context);
  const before = await f.index();
  blocked(await runDelivery(command, f.context), "partial_index");
  assert.deepEqual(await f.index(), before);
  assert.equal(await f.git.run(["ls-files", "--stage", "--", "owned.txt"]), "");
  assert.equal(
    await readFile(join(f.root, "owned.txt"), "utf8"),
    "recreated outside index\n",
  );
  assert.equal(await f.count(), 1);
});

for (const changed of ["owned.txt", "checks-config.json"]) {
  test(`устаревшая проверка после изменения ${changed} блокирует staging`, async (t) => {
    const f = await fixture(t);
    await f.write("owned.txt", "checked content\n");
    await attest(f.context);
    await f.write(changed, "changed after verification\n");
    const before = await f.index();
    blocked(await runDelivery(command, f.context), "checks_stale_or_missing");
    assert.deepEqual(await f.index(), before);
    assert.equal(await f.count(), 1);
  });
}

test("commit без разрешения не меняет индекс и HEAD", async (t) => {
  const f = await fixture(t);
  await f.write("owned.txt", "unauthorized change\n");
  f.context.authorization.actions = ["inspect"];
  const before = await f.index();
  blocked(await runDelivery(command, f.context), "action_not_authorized");
  assert.deepEqual(await f.index(), before);
  assert.equal(await f.count(), 1);
});

for (const action of ["push", "commit_push"] as const) {
  test(`${action} блокируется до staging и создания журнала`, async (t) => {
    const f = await fixture(t);
    await f.write("owned.txt", "pending local change\n");
    const before = await f.index();
    const result = await runDelivery(
      {
        action,
        ...(action === "commit_push" ? { message: command.message } : {}),
      },
      f.context,
    );
    blocked(result, "network_delivery_unavailable");
    assert.equal(result.pushStatus, "not_attempted");
    assert.deepEqual(await f.index(), before);
    assert.equal(await f.count(), 1);
    await assert.rejects(readFile(f.journalPath), { code: "ENOENT" });
  });
}

test("имена с пробелом, newline и pathspec magic остаются буквальными путями", async (t) => {
  const paths = ["space name.txt", "line\nname.txt", ":(glob)*.txt"];
  const f = await fixture(t, paths);
  for (const path of paths) await f.write(path, `literal ${path}\n`);
  await f.write("foreign.txt", "must remain unstaged\n");
  await attest(f.context);
  const result = await runDelivery(command, f.context);
  assert.equal(result.status, "succeeded", JSON.stringify(result));
  const committed = await f.git.run([
    "diff-tree",
    "--no-commit-id",
    "--name-only",
    "-r",
    "-z",
    "HEAD",
  ]);
  assert.deepEqual(
    new Set(committed.split("\0").filter(Boolean)),
    new Set(paths),
  );
  for (const path of paths)
    assert.equal(
      await f.git.run(["show", `HEAD:${path}`]),
      `literal ${path}\n`,
    );
  assert.equal(
    await f.git.run(["show", "HEAD:foreign.txt"]),
    "foreign baseline\n",
  );
});

test("повтор requestId не создаёт commit и не захватывает новые правки", async (t) => {
  const f = await fixture(t);
  await f.write("owned.txt", "first operation\n");
  await attest(f.context);
  const first = await runDelivery(command, f.context);
  assert.equal(first.status, "succeeded", JSON.stringify(first));
  await f.write("owned.txt", "later unrelated operation\n");
  const index = await f.index();
  const repeated = await runDelivery(command, f.context);
  assert.equal(repeated.status, "noop", JSON.stringify(repeated));
  assert.equal(repeated.commit, first.commit);
  assert.equal(repeated.commitCreated, true);
  assert.equal(await f.count(), 2);
  assert.deepEqual(await f.index(), index);
  assert.equal(
    await f.git.run(["show", "HEAD:owned.txt"]),
    "first operation\n",
  );
  assert.equal(
    await readFile(join(f.root, "owned.txt"), "utf8"),
    "later unrelated operation\n",
  );
});

test("завершённый noop не захватывает новые правки со свежими проверками при том же requestId", async (t) => {
  const f = await fixture(t);
  await attest(f.context);
  const first = await runDelivery(command, f.context);
  assert.equal(first.status, "noop", JSON.stringify(first));
  assert.equal(first.commitCreated, false);
  const before = { head: await f.head(), index: await f.index() };
  await f.write("owned.txt", "new change after completed noop\n");
  await attest(f.context);
  const repeated = await runDelivery(command, f.context);
  assert.equal(repeated.status, "noop", JSON.stringify(repeated));
  assert.equal(repeated.commitCreated, false);
  assert.equal(await f.head(), before.head);
  assert.equal(await f.count(), 1);
  assert.deepEqual(await f.index(), before.index);
  assert.equal(await f.git.run(["show", "HEAD:owned.txt"]), "owned baseline\n");
  assert.equal(
    await readFile(join(f.root, "owned.txt"), "utf8"),
    "new change after completed noop\n",
  );
});

test("preparedTree восстанавливает результат после commit без записи его oid", async (t) => {
  const f = await fixture(t);
  await f.write("owned.txt", "recoverable commit\n");
  await attest(f.context);
  const first = await runDelivery(command, f.context);
  assert.equal(first.status, "succeeded", JSON.stringify(first));
  const journal = await f.journal();
  delete journal.commit;
  await writeFile(f.journalPath, JSON.stringify(journal), { mode: 0o600 });
  const recovered = await runDelivery(command, f.context);
  assert.equal(recovered.status, "noop", JSON.stringify(recovered));
  assert.equal(recovered.commit, first.commit);
  assert.equal((await f.journal()).commit, first.commit);
  assert.equal(await f.count(), 2);
});

test("ошибка hook возвращает partial, сохраняет staged и допускает продолжение после исправления", async (t) => {
  const f = await fixture(t);
  await f.write("owned.txt", "hook guarded content\n");
  const hook = join(f.hooks, "pre-commit");
  await writeFile(hook, "#!/bin/sh\nexit 17\n", { mode: 0o700 });
  await attest(f.context);
  const failed = await runDelivery(command, f.context);
  assert.equal(failed.status, "partial", JSON.stringify(failed));
  assert.equal(failed.errorCode, "git_command_failed");
  assert.equal(failed.commitCreated, false);
  assert.equal(await f.count(), 1);
  assert.equal(
    await f.git.run(["show", ":owned.txt"]),
    "hook guarded content\n",
  );
  assert.equal((await f.journal()).result?.status, "partial");
  await rm(hook);
  const retried = await runDelivery(command, f.context);
  assert.equal(retried.status, "succeeded", JSON.stringify(retried));
  assert.equal(await f.count(), 2);
});

test("повреждённый prepared журнал блокирует повтор с сохранением индекса", async (t) => {
  for (const corruption of ["file-hash", "foreign-path"] as const) {
    await t.test(corruption, async (child) => {
      const f = await fixture(child);
      await f.write("owned.txt", "prepared checked content\n");
      await f.write("foreign.txt", "foreign change must remain unstaged\n");
      const hook = join(f.hooks, "pre-commit");
      await writeFile(hook, "#!/bin/sh\nexit 17\n", { mode: 0o700 });
      await attest(f.context);
      const failed = await runDelivery(command, f.context);
      assert.equal(failed.status, "partial", JSON.stringify(failed));
      assert.equal(failed.errorCode, "git_command_failed");
      const journal = await f.journal();
      assert.match(journal.preparedTree!, /^[a-f0-9]{40,64}$/u);
      if (corruption === "file-hash") {
        journal.original.files.find((file) => file.path === "owned.txt")!.hash =
          "0".repeat(64);
      } else {
        journal.paths.push("foreign.txt");
      }
      const damaged = JSON.stringify(journal);
      await writeFile(f.journalPath, damaged, { mode: 0o600 });
      await rm(hook);
      const before = { head: await f.head(), index: await f.index() };
      blocked(await runDelivery(command, f.context), "invalid_journal");
      assert.deepEqual(await f.index(), before.index);
      assert.equal(await f.head(), before.head);
      assert.equal(await f.count(), 1);
      assert.equal(
        await f.git.run(["show", ":owned.txt"]),
        "prepared checked content\n",
      );
      assert.equal(
        await f.git.run(["show", ":foreign.txt"]),
        "foreign baseline\n",
      );
      assert.equal(await readFile(f.journalPath, "utf8"), damaged);
    });
  }
});

test("повтор без preparedTree различает сохранённый staging и последующую правку индекса", async (t) => {
  for (const changedIndex of [false, true]) {
    await t.test(
      changedIndex ? "changed-index" : "completed-staging",
      async (child) => {
        const f = await fixture(child);
        const checkedContent = "checked content before interrupted stage\n";
        await f.write("owned.txt", checkedContent);
        const hook = join(f.hooks, "pre-commit");
        await writeFile(hook, "#!/bin/sh\nexit 17\n", { mode: 0o700 });
        await attest(f.context);
        const failed = await runDelivery(command, f.context);
        assert.equal(failed.status, "partial", JSON.stringify(failed));
        assert.equal(failed.errorCode, "git_command_failed");
        const journal = await f.journal();
        assert.ok(journal.preparedTree);
        delete journal.preparedTree;
        await writeFile(f.journalPath, JSON.stringify(journal), {
          mode: 0o600,
        });
        await rm(hook);
        if (changedIndex) {
          await f.write("owned.txt", "later staged decision\n");
          await f.git.run(["add", "--", "owned.txt"]);
          await f.write("owned.txt", checkedContent);
        }
        const before = { head: await f.head(), index: await f.index() };
        const result = await runDelivery(command, f.context);
        if (changedIndex) {
          blocked(result, "index_changed");
          assert.deepEqual(await f.index(), before.index);
          assert.equal(await f.head(), before.head);
          assert.equal(
            await f.git.run(["show", ":owned.txt"]),
            "later staged decision\n",
          );
          assert.equal(await f.count(), 1);
        } else {
          assert.equal(result.status, "succeeded", JSON.stringify(result));
          assert.equal(result.commitCreated, true);
          assert.equal(
            await f.git.run(["show", "HEAD:owned.txt"]),
            checkedContent,
          );
          assert.equal(await f.count(), 2);
        }
        assert.equal(
          await readFile(join(f.root, "owned.txt"), "utf8"),
          checkedContent,
        );
      },
    );
  }
});

for (const [hookName, source] of [
  [
    "pre-commit",
    "printf '%s\\n' 'changed by hook' > owned.txt\ngit add -- owned.txt\n",
  ],
  ["commit-msg", "printf '%s\\n' 'message changed by hook' > \"$1\"\n"],
]) {
  test(`${hookName}, изменивший commit, не получает успешный результат или слепой повтор`, async (t) => {
    const f = await fixture(t);
    await f.write("owned.txt", "checked before hook\n");
    await writeFile(join(f.hooks, hookName!), `#!/bin/sh\n${source}`, {
      mode: 0o700,
    });
    await attest(f.context);
    const result = await runDelivery(command, f.context);
    assert.equal(result.status, "partial", JSON.stringify(result));
    assert.equal(result.errorCode, "commit_mismatch");
    assert.equal(result.commitCreated, true);
    const actualHead = await f.head();
    assert.equal(result.commit, actualHead);
    const retry = await runDelivery(command, f.context);
    assert.equal(retry.errorCode, "commit_mismatch", JSON.stringify(retry));
    assert.equal(await f.head(), actualHead);
    assert.equal(await f.count(), 2);
  });
}

test("детектор явного синтетического секрета останавливает commit без раскрытия содержимого", async (t) => {
  const f = await fixture(t);
  const syntheticToken = ["ghp", "_", "a".repeat(36)].join("");
  await f.write("owned.txt", `synthetic fixture: ${syntheticToken}\n`);
  await attest(f.context);
  const result = await runDelivery(command, f.context);
  assert.equal(result.status, "partial", JSON.stringify(result));
  assert.equal(result.errorCode, "secret_detected");
  assert.equal(result.commitCreated, false);
  assert.equal(await f.count(), 1);
  assert.equal(JSON.stringify(result).includes(syntheticToken), false);
  assert.equal(
    (await readFile(f.journalPath, "utf8")).includes(syntheticToken),
    false,
  );
});

test("защищённый .env блокируется до staging", async (t) => {
  const f = await fixture(t, [".env"]);
  await f.write(".env", "FIXTURE_ONLY=synthetic\n");
  await attest(f.context);
  const before = await f.index();
  blocked(await runDelivery(command, f.context), "protected_path");
  assert.deepEqual(await f.index(), before);
  assert.equal(await f.count(), 1);
});

test("неизвестные поля и путь ../ отклоняются до обращения к репозиторию", async () => {
  const context: Context = {
    version: 1,
    requestId: "invalid-input",
    projectId: "fixture-project",
    taskId: "fixture-task",
    repositoryRoot: "/nonexistent-realize-validation-fixture",
    authorization: {
      actions: ["inspect"],
      scope: { mode: "paths", paths: ["owned.txt"] },
    },
  };
  blocked(
    await runDelivery({ action: "inspect", unexpected: true }, context),
    "invalid_input",
  );
  blocked(
    await runDelivery({ action: "inspect" }, { ...context, unexpected: true }),
    "invalid_input",
  );
  blocked(
    await runDelivery(
      { action: "inspect" },
      {
        ...context,
        authorization: {
          actions: ["inspect"],
          scope: { mode: "paths", paths: ["../foreign.txt"] },
        },
      },
    ),
    "invalid_path",
  );
});

async function cli(
  root: string,
  contextPath: string,
  input: string,
): Promise<{ code: number | null; result: Result; stderr: string }> {
  return await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [fileURLToPath(new URL("../src/cli.ts", import.meta.url))],
      {
        cwd: root,
        shell: false,
        env: { ...process.env, REALIZE_GIT_CONTEXT_FILE: contextPath },
        stdio: "pipe",
      },
    );
    const output: Buffer[] = [];
    const diagnostic: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => output.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => diagnostic.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      try {
        resolve({
          code,
          result: JSON.parse(Buffer.concat(output).toString()),
          stderr: Buffer.concat(diagnostic).toString(),
        });
      } catch (error) {
        reject(error);
      }
    });
    child.stdin.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code !== "EPIPE") reject(error);
    });
    child.stdin.end(input);
  });
}

test("CLI отвергает общий файл контекста и невалидный JSON без изменения Git", async (t) => {
  const f = await fixture(t);
  const contextPath = join(f.temporary, "context.json");
  await writeFile(contextPath, JSON.stringify(f.context), { mode: 0o600 });
  await chmod(contextPath, 0o644);
  const before = await f.index();
  const unsafe = await cli(f.root, contextPath, '{"action":"inspect"}');
  assert.equal(unsafe.code, 2);
  blocked(unsafe.result, "context_unsafe");
  await chmod(contextPath, 0o600);
  const malformedCommand = await cli(f.root, contextPath, "{broken command");
  assert.equal(malformedCommand.code, 2);
  blocked(malformedCommand.result, "invalid_input");
  await writeFile(contextPath, "{broken context");
  const malformedContext = await cli(
    f.root,
    contextPath,
    '{"action":"inspect"}',
  );
  assert.equal(malformedContext.code, 2);
  blocked(malformedContext.result, "invalid_input");
  assert.deepEqual(await f.index(), before);
  assert.equal(await f.count(), 1);
});
