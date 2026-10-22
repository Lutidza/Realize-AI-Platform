/**
 * @file .ai/tools/git-delivery/test/GitNetworkSsh.adapter.test.ts
 * @version 1.0.1
 * @date 2026-10-22
 * @description Проверяет SSH-профили и effective config без сети, а также точный stdin pre-push guard.
 */
import { FixtureGit } from "./fixtures/FixtureGit.adapter.ts";

import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { TestContext } from "node:test";
import { promisify } from "node:util";
import { GitFailure } from "@realize/git-runtime";
import { resolveGitSshProfile } from "../src/network/resolveGitSshProfile.adapter.ts";
import { createGitSshCommand } from "../src/network/createGitSshCommand.adapter.ts";
import { createGitPushHook } from "../src/network/createGitPushHook.adapter.ts";

const execute = promisify(execFile);
async function fixture(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), "realize-git-ssh-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const knownHostsFile = join(root, "known hosts");
  const identityFile = join(root, "identity key");
  await writeFile(knownHostsFile, "github.com ssh-ed25519 AAAA\n", {
    mode: 0o600,
  });
  await writeFile(identityFile, "synthetic-private-key\n", { mode: 0o600 });
  return { root, profile: { knownHostsFile, identityFile } };
}

test("SSH key: effective config закрепляет host checking и единственную identity без agent/config fallback", async (t) => {
  const f = await fixture(t);
  const profile = await resolveGitSshProfile({ primary: f.profile }, "primary");
  const command = await createGitSshCommand(f.root, profile);
  const { stdout } = await execute(command, ["-G", "git@github.com"]);
  assert.match(stdout, /^batchmode yes$/m);
  assert.match(stdout, /^stricthostkeychecking true$/m);
  assert.match(stdout, /^identitiesonly yes$/m);
  assert.match(stdout, /^identityagent none$/m);
  assert.match(stdout, /^passwordauthentication no$/m);
  assert.match(stdout, /^kbdinteractiveauthentication no$/m);
  assert.equal(
    stdout.split("\n").filter((line) => line.startsWith("identityfile "))
      .length,
    1,
  );
  assert.ok(stdout.includes(`identityfile ${f.profile.identityFile}\n`));
  assert.ok(
    stdout.includes(`userknownhostsfile ${f.profile.knownHostsFile}\n`),
  );
});

test("SSH map, symlink и private key permissions отклоняются до вызова SSH", async (t) => {
  const f = await fixture(t);
  const invalid = (error: unknown) =>
    error instanceof GitFailure && error.code === "git_ssh_profile_invalid";
  await assert.rejects(
    resolveGitSshProfile(
      { primary: f.profile, malformed: { command: "ssh" } },
      "primary",
    ),
    invalid,
  );
  await assert.rejects(
    resolveGitSshProfile({ "primary.invalid": f.profile }, "primary.invalid"),
    invalid,
  );
  await chmod(f.profile.identityFile, 0o644);
  await assert.rejects(
    resolveGitSshProfile({ primary: f.profile }, "primary"),
    invalid,
  );
  await chmod(f.profile.identityFile, 0o600);
  const link = join(f.root, "host-link");
  await symlink(f.profile.knownHostsFile, link);
  await assert.rejects(
    resolveGitSshProfile(
      { primary: { ...f.profile, knownHostsFile: link } },
      "primary",
    ),
    invalid,
  );
});

test("SSH explicit agent требует pinned public identity и собственный Unix socket", async (t) => {
  const f = await fixture(t);
  const agentSocket = join(f.root, "agent.sock");
  const server = createServer((socket) => socket.end());
  server.listen(agentSocket);
  await once(server, "listening");
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const profile = { ...f.profile, agentSocket };
  await assert.rejects(resolveGitSshProfile({ primary: profile }, "primary"));
  await writeFile(f.profile.identityFile, "ssh-ed25519 AAAA fixture\n");
  assert.deepEqual(
    await resolveGitSshProfile({ primary: profile }, "primary"),
    profile,
  );
  const command = await createGitSshCommand(f.root, profile);
  const { stdout } = await execute(command, ["-G", "git@github.com"]);
  assert.ok(stdout.includes(`identityagent ${agentSocket}\n`));
  assert.equal(
    stdout.split("\n").filter((line) => line.startsWith("identityfile "))
      .length,
    1,
  );
});

test("pre-push stdin guard не допускает подмену source/ref, extra refs или deletion", async (t) => {
  const f = await fixture(t);
  const git = new FixtureGit(f.root);
  await git.run(["init", "--initial-branch=main"]);
  const marker = join(f.root, "hook-marker");
  await writeFile(
    join(f.root, ".git/hooks/pre-push"),
    `#!/bin/sh\ncat > '${marker}'\n`,
    { mode: 0o700 },
  );
  const directory = join(f.root, "session");
  await mkdir(directory);
  const sourceOid = "a".repeat(40);
  const old = "b".repeat(40);
  const hooks = await createGitPushHook(git, directory, {
    sourceOid,
    remoteOid: old,
    branch: "main",
  });
  const valid = `${sourceOid} ${sourceOid} refs/heads/main ${old}\n`;
  async function run(input: string): Promise<number | null> {
    const child = spawn(
      join(hooks, "pre-push"),
      ["origin", "https://github.com/fixture/repository.git"],
      { cwd: f.root, stdio: ["pipe", "ignore", "ignore"] },
    );
    child.stdin.end(input);
    const [status] = await once(child, "close");
    return status;
  }
  assert.equal(await run(valid.replace(` ${sourceOid} `, ` ${old} `)), 1);
  assert.equal(
    await run(valid.replace("refs/heads/main", "refs/heads/other")),
    1,
  );
  assert.equal(await run(valid + valid), 1);
  assert.equal(
    await run(`(delete) ${"0".repeat(40)} refs/heads/main ${old}\n`),
    1,
  );
  await assert.rejects(readFile(marker), { code: "ENOENT" });
  assert.equal(await run(valid), 0);
  assert.equal(await readFile(marker, "utf8"), valid);
});
