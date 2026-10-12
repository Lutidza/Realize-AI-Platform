/**
 * @file .ai/tools/git-delivery/test/gitSyncNetwork.adapter.test.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Проверяет реальный адресный fetch и CAS во временных репозиториях, подменяя только credential transport fixture-адаптером.
 */

import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { TestContext } from "node:test";
import { Git } from "../src/Git.adapter.ts";
import type { GitRunOptions } from "../src/Git.types.ts";
import { createGitNetworkSession } from "../src/network/createGitNetworkSession.adapter.ts";
import type { GitNetworkConnection } from "../src/network/GitNetwork.types.ts";

async function fixture(t: TestContext) {
  const root = await mkdtemp(
    join(tmpdir(), "realize-git-sync-network-fixture-"),
  );
  t.after(() => rm(root, { recursive: true, force: true }));
  const producer = join(root, "producer");
  const consumer = join(root, "consumer");
  await mkdir(producer);
  const sourceGit = new Git(producer);
  await sourceGit.run(["init", "--initial-branch=main", "--template="]);
  for (const [key, value] of Object.entries({
    "core.hooksPath": "/dev/null",
    "commit.gpgSign": "false",
    "user.name": "Fixture",
    "user.email": "fixture@example.invalid",
  }))
    await sourceGit.run(["config", "--local", key, value]);
  await writeFile(join(producer, "owned.txt"), "seed\n");
  await sourceGit.run(["add", "owned.txt"]);
  await sourceGit.run(["commit", "-m", "Network fixture seed"]);
  const sourceOid = (await sourceGit.run(["rev-parse", "HEAD"])).trim();
  await new Git(root).run(["clone", "--no-local", producer, consumer]);
  await writeFile(join(producer, "owned.txt"), "received\n");
  await sourceGit.run(["add", "owned.txt"]);
  await sourceGit.run(["commit", "-m", "Network fixture remote advance"]);
  const remoteOid = (await sourceGit.run(["rev-parse", "HEAD"])).trim();
  await sourceGit.run(["tag", "fixture-tag"]);
  await sourceGit.run(["branch", "unassigned", sourceOid]);
  const canonical = "https://github.com/fixture-owner/fixture-repository.git";
  const token = "synthetic-fetch-credential";
  const connection: GitNetworkConnection = {
    state: "ready",
    connectionKey: "github:primary",
    revision: 1,
    repositorySlug: "fixture-owner/fixture-repository",
    repositoryURL: canonical,
    transport: "https",
    token,
  };
  const captured: string[][] = [];
  const executables: string[] = [];
  let mutateBeforeCas: (() => Promise<void>) | undefined;
  class FixtureTransportGit extends Git {
    override async run(
      args: string[],
      options: GitRunOptions = {},
    ): Promise<string> {
      captured.push([...args]);
      if (options.network) {
        assert.equal(options.network.transport, "https");
        if (options.network.transport === "https") {
          assert.equal(options.network.token, token);
          executables.push(options.network.askpassPath);
        }
        // Production auth/TLS покрыты existing network tests; fixture никогда не обращается к GitHub.
        return super.run(
          args.map((arg) => (arg === canonical ? producer : arg)),
        );
      }
      if (args[0] === "update-ref" && mutateBeforeCas) await mutateBeforeCas();
      return super.run(args, options);
    }
  }
  const localGit = new Git(consumer);
  await writeFile(
    join(consumer, ".git/FETCH_HEAD"),
    "existing-fetch-evidence\n",
  );
  const networkGit = new FixtureTransportGit(consumer);
  const open = () =>
    createGitNetworkSession({
      git: networkGit,
      connection,
      expected: { branch: "main", sourceOid, remoteOid },
    });
  return {
    root,
    consumer,
    localGit,
    captured,
    executables,
    sourceOid,
    remoteOid,
    connection,
    open,
    setRace(callback: () => Promise<void>) {
      mutateBeforeCas = callback;
    },
  };
}

test("fetch скачивает pinned commit без tags/FETCH_HEAD/origin refs и создаёт service-owned ref CAS", async (t) => {
  const f = await fixture(t);
  const indexBefore = await readFile(join(f.consumer, ".git/index"));
  const configBefore = await readFile(join(f.consumer, ".git/config"));
  const session = await f.open();
  t.after(() => session.close());
  assert.equal(await session.readRemoteHead(), f.remoteOid);
  const ref = "refs/remotes/realize-sync/main";
  await session.fetch(ref, null);
  assert.equal((await f.localGit.run(["rev-parse", ref])).trim(), f.remoteOid);
  assert.equal(
    (await f.localGit.run(["rev-parse", "HEAD"])).trim(),
    f.sourceOid,
  );
  assert.equal(
    (await f.localGit.run(["rev-parse", "refs/remotes/origin/main"])).trim(),
    f.sourceOid,
  );
  assert.equal((await f.localGit.run(["tag", "--list"])).trim(), "");
  assert.equal(
    await readFile(join(f.consumer, ".git/FETCH_HEAD"), "utf8"),
    "existing-fetch-evidence\n",
  );
  assert.deepEqual(await readFile(join(f.consumer, ".git/index")), indexBefore);
  assert.deepEqual(
    await readFile(join(f.consumer, ".git/config")),
    configBefore,
  );
  assert.equal(await readFile(join(f.consumer, "owned.txt"), "utf8"), "seed\n");
  const fetch = f.captured.find((args) => args.includes("fetch"));
  assert.ok(fetch);
  assert.deepEqual(fetch.slice(fetch.indexOf("fetch") + 1), [
    "--no-tags",
    "--no-prune",
    "--no-write-fetch-head",
    "--no-recurse-submodules",
    "--no-auto-maintenance",
    "--no-show-forced-updates",
    "--refmap=",
    "--",
    f.connection.repositoryURL,
    f.remoteOid,
  ]);
  assert.equal(fetch.includes("--force"), false);
  assert.equal(
    JSON.stringify(f.captured).includes("synthetic-fetch-credential"),
    false,
  );
  assert.deepEqual(
    f.captured.find((args) => args[0] === "update-ref"),
    ["update-ref", ref, f.remoteOid, "0".repeat(40)],
  );
  await session.close();
  assert.ok(f.executables.length);
  for (const executable of new Set(f.executables))
    await assert.rejects(readFile(executable), { code: "ENOENT" });
});

test("CAS не перезаписывает ref, изменившийся после read; сеть не принимает чужой namespace", async (t) => {
  const f = await fixture(t);
  const session = await f.open();
  t.after(() => session.close());
  await assert.rejects(session.fetch("refs/heads/main", null));
  const ref = "refs/remotes/realize-sync/main";
  f.setRace(() =>
    f.localGit.run(["update-ref", ref, f.sourceOid]).then(() => {}),
  );
  await assert.rejects(session.fetch(ref, null));
  assert.equal((await f.localGit.run(["rev-parse", ref])).trim(), f.sourceOid);
  assert.equal(
    (await f.localGit.run(["rev-parse", "HEAD"])).trim(),
    f.sourceOid,
  );
});

test("stable tracking ref обновляется с явным предыдущим OID без force", async (t) => {
  const f = await fixture(t);
  const ref = "refs/remotes/realize-sync/main";
  await f.localGit.run(["update-ref", ref, f.sourceOid]);
  const session = await f.open();
  t.after(() => session.close());
  await session.fetch(ref, f.sourceOid);
  assert.equal((await f.localGit.run(["rev-parse", ref])).trim(), f.remoteOid);
  assert.deepEqual(
    f.captured.find((args) => args[0] === "update-ref"),
    ["update-ref", ref, f.remoteOid, f.sourceOid],
  );
});
