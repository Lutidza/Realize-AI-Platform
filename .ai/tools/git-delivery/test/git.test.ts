/**
 * @file .ai/tools/git-delivery/test/git.test.ts
 * @version 1.1.2
 * @date 2026-10-22
 * @description Проверяет executor и flock только в изолированных временных каталогах и Git fixtures.
 */
import { FixtureGit } from "./fixtures/FixtureGit.adapter.ts";
import { acquireGitLock as acquireLock } from "@realize/git-runtime";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";
import type { TestContext } from "node:test";
import { inspect } from "node:util";
import { Git, GitFailure } from "@realize/git-runtime";

async function temporaryRoot(t: TestContext): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "realize-git-executor-"));
  t.after(async () => {
    await rm(root, { recursive: true, force: true });
  });
  return root;
}

async function commandFixture(root: string, source: string): Promise<string> {
  const command = join(root, "command.mjs");
  await writeFile(command, `#!${process.execPath}\n${source}\n`, {
    mode: 0o700,
  });
  return command;
}

function failureCode(code: string): (error: unknown) => boolean {
  return (error) =>
    error instanceof Error && "code" in error && error.code === code;
}

async function waitForFile(path: string): Promise<void> {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    try {
      await access(path);
      return;
    } catch {
      await delay(20);
    }
  }
  assert.fail("Fixture не подтвердил запуск вовремя.");
}

test("runBytes возвращает staged binary blob, run отклоняет невалидный UTF-8", async (t) => {
  const root = await temporaryRoot(t);
  const git = new FixtureGit(root);
  await git.run(["init", "--initial-branch=main"]);
  const binary = Buffer.from([0, 255, 128, 13, 10, 0, 42]);
  await writeFile(join(root, ":binary.dat"), binary);
  await git.run(["add", "--", ":binary.dat"]);
  const blob = (await git.run(["rev-parse", ":0::binary.dat"])).trim();
  assert.deepEqual(await git.runBytes(["cat-file", "blob", blob]), binary);
  await assert.rejects(
    git.run(["cat-file", "blob", blob]),
    failureCode("git_output_invalid"),
  );
});

test("аргументы и stdin остаются данными, опасное окружение не наследуется", async (t) => {
  const root = await temporaryRoot(t);
  const command = await commandFixture(
    root,
    `
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    process.stdout.write(JSON.stringify({ args: process.argv.slice(2), input: Buffer.concat(chunks).toString(),
      author: process.env.GIT_AUTHOR_NAME, gitDir: process.env.GIT_DIR, index: process.env.GIT_INDEX_FILE,
      token: process.env.REALIZE_GIT_TEST_TOKEN, locks: process.env.GIT_OPTIONAL_LOCKS,
      prompts: process.env.GIT_TERMINAL_PROMPT, home: process.env.HOME }));
  `,
  );
  const injected = {
    GIT_DIR: "/fixture/foreign",
    GIT_INDEX_FILE: "/fixture/index",
    REALIZE_GIT_TEST_TOKEN: "synthetic-fixture-value",
  };
  const previous = Object.fromEntries(
    Object.keys(injected).map((key) => [key, process.env[key]]),
  );
  Object.assign(process.env, injected);
  try {
    const args = ["status", "$(touch forbidden)", "quote\"'`\n"];
    const input = "Сообщение\nс переводом строки\n";
    const git = new Git(root, { command });
    const output = JSON.parse(
      await git.run(args, {
        input,
        env: { GIT_AUTHOR_NAME: "Fixture Author" },
      }),
    );
    assert.deepEqual(output.args, [
      "--literal-pathspecs",
      "-c",
      "core.fsmonitor=false",
      ...args,
    ]);
    assert.equal(output.input, input);
    assert.equal(output.author, "Fixture Author");
    assert.equal(output.gitDir, undefined);
    assert.equal(output.index, undefined);
    assert.equal(output.token, undefined);
    assert.equal(output.home, process.env.HOME);
    assert.equal(output.locks, "0");
    assert.equal(output.prompts, "0");
    await assert.rejects(access(join(root, "forbidden")));
    await assert.rejects(
      git.run(["status"], { env: { GIT_CONFIG_COUNT: "1" } }),
      failureCode("git_environment_invalid"),
    );
    await assert.rejects(
      git.run(["status"], { input: "x".repeat(1024 * 1024 + 1) }),
      failureCode("git_input_limit"),
    );
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

for (const stream of ["stdout", "stderr"] as const) {
  test(`${stream} ограничивается независимо от второго потока`, async (t) => {
    const root = await temporaryRoot(t);
    const command = await commandFixture(
      root,
      `process.${stream}.write(Buffer.alloc(4096, 120));`,
    );
    const git = new Git(root, { command, maxOutputBytes: 64 });
    await assert.rejects(git.runBytes(["status"]), (error) => {
      assert.ok(error instanceof GitFailure);
      assert.equal(error.code, "git_output_limit");
      assert.equal(error.category, "output_limit");
      return true;
    });
  });
}

test("ошибка сохраняет exitCode и не раскрывает stderr", async (t) => {
  const root = await temporaryRoot(t);
  const command = await commandFixture(
    root,
    `process.stderr.write("private fixture diagnostic"); process.exitCode = 9;`,
  );
  const git = new Git(root, { command });
  await assert.rejects(git.run(["status"]), (error) => {
    assert.ok(error instanceof GitFailure);
    assert.equal(error.code, "git_command_failed");
    assert.equal(error.exitCode, 9);
    assert.equal(error.category, "unknown");
    assert.equal(error.message.includes("private fixture diagnostic"), false);
    return true;
  });
});

test("nonzero классифицируется по stderr и сохраняет секреты внутри процесса", async (t) => {
  const root = await temporaryRoot(t);
  const fixtureUrl = new URL("https://fixture.invalid/private-branch");
  fixtureUrl.username = "fixture-user";
  fixtureUrl.password = "synthetic-secret";
  const privateDiagnostic = fixtureUrl.href;
  const command = await commandFixture(
    root,
    `process.stdout.write(${JSON.stringify(privateDiagnostic)});
     process.stderr.write("fatal: Authentication ");
     setImmediate(() => { process.stderr.write("failed for " + ${JSON.stringify(privateDiagnostic)}); process.exitCode = 128; });`,
  );
  const git = new Git(root, { command });
  await assert.rejects(git.run(["status"]), (error) => {
    assert.ok(error instanceof GitFailure);
    assert.equal(error.code, "git_command_failed");
    assert.equal(error.exitCode, 128);
    assert.equal(error.category, "authentication_failed");
    const serialized = `${JSON.stringify(error)}\n${inspect(error)}\n${error.stack}`;
    for (const secret of [
      privateDiagnostic,
      "synthetic-secret",
      "fixture-user",
      "private-branch",
    ]) {
      assert.equal(serialized.includes(secret), false);
    }
    return true;
  });
});

for (const beforeLimit of [true, false]) {
  test(`диагностика ${beforeLimit ? "до" : "после"} предела 64 KiB при полностью дренированном stderr`, async (t) => {
    const root = await temporaryRoot(t);
    const source = beforeLimit
      ? `process.stderr.write("fatal: Authentication failed\\n"); process.stderr.write(Buffer.alloc(96 * 1024, 120));`
      : `process.stderr.write("я".repeat(32 * 1024)); process.stderr.write("\\nfatal: Authentication failed\\n");`;
    const command = await commandFixture(
      root,
      `${source} process.exitCode = 9;`,
    );
    const git = new Git(root, { command, maxOutputBytes: 128 * 1024 });
    await assert.rejects(git.run(["status"]), (error) => {
      assert.ok(error instanceof GitFailure);
      assert.equal(error.code, "git_command_failed");
      assert.equal(error.exitCode, 9);
      assert.equal(
        error.category,
        beforeLimit ? "authentication_failed" : "unknown",
      );
      return true;
    });
  });
}

test("лимит stderr важнее известной категории в его префиксе", async (t) => {
  const root = await temporaryRoot(t);
  const command = await commandFixture(
    root,
    `process.stderr.write("fatal: Authentication failed\\n"); process.stderr.write(Buffer.alloc(128 * 1024, 120)); process.exitCode = 9;`,
  );
  const git = new Git(root, { command, maxOutputBytes: 64 * 1024 });
  await assert.rejects(git.runBytes(["status"]), (error) => {
    assert.ok(error instanceof GitFailure);
    assert.equal(error.code, "git_output_limit");
    assert.equal(error.category, "output_limit");
    assert.equal(error.exitCode, null);
    return true;
  });
});

test("успех не превращается в ошибку из-за диагностического stderr", async (t) => {
  const root = await temporaryRoot(t);
  const command = await commandFixture(
    root,
    `process.stderr.write("fatal: Authentication failed\\n"); process.stderr.write(Buffer.alloc(96 * 1024, 120)); process.stdout.write("ok");`,
  );
  assert.equal(await new Git(root, { command }).run(["status"]), "ok");
});

test("бинарный stderr не мешает возврату безопасного nonzero", async (t) => {
  const root = await temporaryRoot(t);
  const command = await commandFixture(
    root,
    `process.stderr.write(Buffer.from([255, 128, 0, 27])); process.exitCode = 2;`,
  );
  await assert.rejects(new Git(root, { command }).run(["status"]), (error) => {
    assert.ok(error instanceof GitFailure);
    assert.equal(error.code, "git_command_failed");
    assert.equal(error.exitCode, 2);
    assert.equal(error.category, "unknown");
    return true;
  });
});

test("timeout завершает process group вместе с обычным дочерним процессом", async (t) => {
  const root = await temporaryRoot(t);
  const ready = join(root, "descendant.pid");
  const survived = join(root, "descendant-survived");
  const childSource = `
    const fs = require("node:fs");
    fs.writeFileSync(${JSON.stringify(ready)}, String(process.pid));
    setTimeout(() => fs.writeFileSync(${JSON.stringify(survived)}, "survived"), 1500);
  `;
  const command = await commandFixture(
    root,
    `
    import { spawn } from "node:child_process";
    spawn(process.execPath, ["-e", ${JSON.stringify(childSource)}], { stdio: "ignore" });
    setInterval(() => {}, 1000);
  `,
  );
  const git = new Git(root, { command, timeoutMs: 700 });
  await assert.rejects(git.runBytes(["status"]), (error) => {
    assert.ok(error instanceof GitFailure);
    assert.equal(error.code, "git_timeout");
    assert.equal(error.category, "timeout");
    return true;
  });
  assert.match(await readFile(ready, "utf8"), /^\d+$/u);
  await delay(1600);
  await assert.rejects(access(survived));
});

test("связанные worktree разделяют блокировку commonDir, release разрешает следующий вызов", async (t) => {
  const root = await temporaryRoot(t);
  const repository = join(root, "repository");
  const linked = join(root, "linked");
  const hooks = join(root, "hooks");
  await mkdir(repository);
  await mkdir(hooks);
  const git = new FixtureGit(repository);
  await git.run(["init", "--initial-branch=main"]);
  await git.run(["config", "core.hooksPath", hooks]);
  const tree = (
    await git.run(["hash-object", "-t", "tree", "-w", "--stdin"], { input: "" })
  ).trim();
  const commit = (
    await git.run(
      [
        "-c",
        "commit.gpgSign=false",
        "commit-tree",
        tree,
        "-m",
        "Isolated lock fixture",
      ],
      {
        env: {
          GIT_AUTHOR_NAME: "Fixture",
          GIT_AUTHOR_EMAIL: "fixture@example.invalid",
          GIT_COMMITTER_NAME: "Fixture",
          GIT_COMMITTER_EMAIL: "fixture@example.invalid",
        },
      },
    )
  ).trim();
  await git.run(["update-ref", "refs/heads/main", commit]);
  await git.run(["worktree", "add", "--detach", linked, commit]);
  const other = new Git(linked);
  const common = await realpath(
    (
      await git.run(["rev-parse", "--path-format=absolute", "--git-common-dir"])
    ).trim(),
  );
  const linkedCommon = await realpath(
    (
      await other.run([
        "rev-parse",
        "--path-format=absolute",
        "--git-common-dir",
      ])
    ).trim(),
  );
  assert.equal(common, linkedCommon);
  const lock = await acquireLock(common);
  try {
    lock.assertHeld();
    await assert.rejects(
      acquireLock(linkedCommon),
      failureCode("repository_locked"),
    );
  } finally {
    await lock.release();
  }
  assert.throws(() => lock.assertHeld(), failureCode("lock_lost"));
  const next = await acquireLock(linkedCommon);
  await next.release();
});

test("Git удерживает унаследованный lock после смерти родителя и освобождает его при выходе", async (t) => {
  const root = await temporaryRoot(t);
  const ready = join(root, "git-ready");
  const release = join(root, "git-release");
  const command = await commandFixture(
    root,
    `
    import { existsSync, fstatSync, writeFileSync } from "node:fs";
    if (!fstatSync(3).isDirectory()) process.exit(90);
    writeFileSync(${JSON.stringify(ready)}, "ready");
    setInterval(() => { if (existsSync(${JSON.stringify(release)})) process.exit(0); }, 20);
    setTimeout(() => process.exit(91), 5000);
  `,
  );
  const gitModule = import.meta.resolve("@realize/git-runtime");
  const stateModule = import.meta.resolve("@realize/git-runtime");
  const parent = spawn(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `
    import { Git } from ${JSON.stringify(gitModule)};
    import { acquireGitLock as acquireLock } from ${JSON.stringify(stateModule)};
    const lock = await acquireLock(${JSON.stringify(root)});
    const git = new Git(${JSON.stringify(root)}, { command: ${JSON.stringify(command)} });
    git.attachLock(lock);
    await git.runBytes(["status"]);
    await lock.release();
  `,
    ],
    { cwd: root, stdio: "ignore" },
  );
  const closed = once(parent, "close");
  try {
    await waitForFile(ready);
    parent.kill("SIGKILL");
    await closed;
    await assert.rejects(acquireLock(root), failureCode("repository_locked"));
    await writeFile(release, "release");
    let released = false;
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      try {
        const lock = await acquireLock(root);
        await lock.release();
        released = true;
        break;
      } catch (error) {
        if (!failureCode("repository_locked")(error)) throw error;
        await delay(20);
      }
    }
    assert.equal(released, true);
  } finally {
    await writeFile(release, "release");
    parent.kill("SIGKILL");
    await closed;
  }
});
