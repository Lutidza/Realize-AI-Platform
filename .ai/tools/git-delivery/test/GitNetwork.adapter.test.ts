/**
 * @file .ai/tools/git-delivery/test/GitNetwork.adapter.test.ts
 * @version 1.0.1
 * @date 2026-10-22
 * @description Проверяет HTTPS Git transport и advertised guard только на изолированном loopback fixture.
 */
import { FixtureGit } from "./fixtures/FixtureGit.adapter.ts";

import assert from "node:assert/strict";
import { spawn, execFile } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { TestContext } from "node:test";
import { promisify } from "node:util";
import { GitFailure } from "@realize/git-runtime";
import { createGitNetworkSession } from "../src/network/createGitNetworkSession.adapter.ts";
import type { GitNetworkConnection } from "../src/network/GitNetwork.types.ts";

const execute = promisify(execFile);
const TOKEN = "synthetic-network-fixture-token";
const CANONICAL = "https://github.com/fixture/repository.git";
const identity = {
  GIT_AUTHOR_NAME: "Fixture",
  GIT_AUTHOR_EMAIL: "fixture@example.test",
  GIT_COMMITTER_NAME: "Fixture",
  GIT_COMMITTER_EMAIL: "fixture@example.test",
};
const connection: GitNetworkConnection = {
  state: "ready",
  connectionKey: "github:primary",
  revision: 1,
  repositorySlug: "fixture/repository",
  repositoryURL: CANONICAL,
  transport: "https",
  token: TOKEN,
};

function code(expected: string): (error: unknown) => boolean {
  return (error) => error instanceof GitFailure && error.code === expected;
}

async function fixture(
  t: TestContext,
  mode: "normal" | "untrusted" | "redirect" = "normal",
) {
  const root = await mkdtemp(join(tmpdir(), "realize-git-https-test-"));
  t.after(async () => {
    await rm(root, { recursive: true, force: true });
  });
  const local = join(root, "local");
  const remoteRoot = join(root, "remote.git");
  await mkdir(local);
  const localGit = new FixtureGit(local);
  await localGit.run(["init", "--initial-branch=main"]);
  await localGit.run(["config", "commit.gpgsign", "false"]);
  await writeFile(join(local, "owned.txt"), "seed\n");
  await localGit.run(["add", "owned.txt"]);
  await localGit.run(["commit", "-m", "Fixture seed"], { env: identity });
  const sourceOid = (await localGit.run(["rev-parse", "HEAD"])).trim();
  await new FixtureGit(root).run(["init", "--bare", remoteRoot]);
  const remoteGit = new FixtureGit(remoteRoot);
  await remoteGit.run(["config", "http.receivepack", "true"]);
  const certificate = join(root, "cert.pem");
  await execute("/usr/bin/openssl", [
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-keyout",
    join(root, "key.pem"),
    "-out",
    certificate,
    "-subj",
    "/CN=127.0.0.1",
    "-addext",
    "subjectAltName=IP:127.0.0.1",
    "-days",
    "1",
  ]);
  let authenticated = 0;
  let requests = 0;
  let redirectsFollowed = 0;
  const server = createServer(
    {
      key: await readFile(join(root, "key.pem")),
      cert: await readFile(certificate),
    },
    (request, response) => {
      requests++;
      if (mode === "redirect") {
        if (request.url?.startsWith("/redirected")) {
          redirectsFollowed++;
          response.end();
          return;
        }
        response.writeHead(302, { location: "/redirected" });
        response.end();
        return;
      }
      if (
        request.headers.authorization !==
        `Basic ${Buffer.from(`x-access-token:${TOKEN}`).toString("base64")}`
      ) {
        response.writeHead(401, {
          "www-authenticate": 'Basic realm="fixture"',
        });
        response.end();
        request.resume();
        return;
      }
      authenticated++;
      const url = new URL(request.url!, "https://127.0.0.1");
      const backend = spawn("/usr/lib/git-core/git-http-backend", [], {
        env: {
          PATH: process.env.PATH,
          GIT_PROJECT_ROOT: root,
          GIT_HTTP_EXPORT_ALL: "1",
          PATH_INFO: url.pathname,
          REQUEST_METHOD: request.method!,
          QUERY_STRING: url.search.slice(1),
          CONTENT_TYPE: request.headers["content-type"] ?? "",
          CONTENT_LENGTH: request.headers["content-length"] ?? "",
          REMOTE_USER: "fixture",
        },
        stdio: ["pipe", "pipe", "ignore"],
      });
      let headers = Buffer.alloc(0);
      let sent = false;
      backend.stdout.on("data", (chunk: Buffer) => {
        if (sent) {
          response.write(chunk);
          return;
        }
        headers = Buffer.concat([headers, chunk]);
        const end = headers.indexOf("\r\n\r\n");
        if (end < 0) return;
        let status = 200;
        const fields: Record<string, string> = {};
        for (const line of headers.subarray(0, end).toString().split("\r\n")) {
          const colon = line.indexOf(":");
          const key = line.slice(0, colon).toLowerCase();
          const value = line.slice(colon + 1).trim();
          if (key === "status") status = Number(value.slice(0, 3));
          else fields[key] = value;
        }
        response.writeHead(status, fields);
        sent = true;
        response.write(headers.subarray(end + 4));
        headers = Buffer.alloc(0);
      });
      backend.on("close", () => response.end());
      backend.on("error", () => {
        response.statusCode = 500;
        response.end();
      });
      backend.stdin.on("error", () => {});
      request.pipe(backend.stdin);
    },
  );
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const endpoint = `https://127.0.0.1:${address.port}/remote.git`;
  const capture = join(root, "commands.jsonl");
  const shim = join(root, "git-shim.cjs");
  await writeFile(
    shim,
    `#!${process.execPath}
const {spawn} = require("node:child_process");
const {appendFileSync} = require("node:fs");
const args = process.argv.slice(2);
appendFileSync(${JSON.stringify(capture)}, JSON.stringify({args, askpass: process.env.GIT_ASKPASS, inheritedSsh: process.env.SSH_AUTH_SOCK, arbitrary:process.env.GIT_TRACE}) + "\\n");
const mapped = args.map(value => value === ${JSON.stringify(CANONICAL)} ? ${JSON.stringify(endpoint)} : value);
if (${JSON.stringify(mode)} !== "untrusted" && args.includes(${JSON.stringify(CANONICAL)})) mapped.unshift("-c", ${JSON.stringify(`http.sslCAInfo=${certificate}`)});
const child = spawn("/usr/bin/git", mapped, {env:process.env, stdio:"inherit", shell:false});
child.on("error", () => {process.exitCode = 1;});
child.on("exit", code => {process.exitCode = code ?? 1;});
`,
    { mode: 0o700 },
  );
  const git = new FixtureGit(local, { command: shim, timeoutMs: 15_000 });
  return {
    root,
    local,
    git,
    localGit,
    remoteGit,
    sourceOid,
    capture,
    authenticated: () => authenticated,
    requests: () => requests,
    redirectsFollowed: () => redirectsFollowed,
    open: (remoteOid: string | null = null, supplied = connection) =>
      createGitNetworkSession({
        git,
        connection: supplied,
        expected: { branch: "main", sourceOid, remoteOid },
      }),
  };
}

test("реальный HTTPS push: token askpass, точный refspec, configured hook и cleanup", async (t) => {
  const f = await fixture(t);
  const hookDirectory = join(f.root, "configured-hooks");
  await mkdir(hookDirectory);
  const marker = join(f.root, "hook.json");
  await writeFile(
    join(hookDirectory, "pre-push"),
    `#!${process.execPath}
const fs = require("node:fs");
const {execFileSync} = require("node:child_process");
fs.writeFileSync(${JSON.stringify(marker)}, JSON.stringify({input:fs.readFileSync(0,"utf8"),args:process.argv.slice(2),token:process.env.REALIZE_GIT_HTTP_TOKEN,nestedHooks:execFileSync("/usr/bin/git",["config","core.hooksPath"],{encoding:"utf8"}).trim()}));
`,
    { mode: 0o700 },
  );
  await f.localGit.run(["config", "core.hooksPath", hookDirectory]);
  await f.localGit.run(["config", "credential.helper", "!exit 91"]);
  await f.localGit.run(["config", "push.pushOption", "must-not-be-sent"]);
  const session = await f.open();
  t.after(() => session.close());
  assert.equal(await session.readRemoteHead(), null);
  await session.push();
  assert.equal(await session.readRemoteHead(), f.sourceOid);
  assert.equal(
    (await f.remoteGit.run(["rev-parse", "refs/heads/main"])).trim(),
    f.sourceOid,
  );
  assert.ok(f.authenticated() >= 3);
  const hook = JSON.parse(await readFile(marker, "utf8"));
  assert.equal(
    hook.input,
    `${f.sourceOid} ${f.sourceOid} refs/heads/main ${"0".repeat(40)}\n`,
  );
  assert.equal(hook.token, undefined);
  assert.equal(hook.nestedHooks, hookDirectory);
  assert.equal(hook.args.length, 2);
  const captured = await readFile(f.capture, "utf8");
  assert.equal(captured.includes(TOKEN), false);
  const records = captured
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  const askpass = records.find((record) => record.askpass)?.askpass;
  assert.ok(askpass);
  assert.equal((await readFile(askpass, "utf8")).includes(TOKEN), false);
  assert.equal(
    (await f.localGit.run(["config", "--local", "--list"])).includes(TOKEN),
    false,
  );
  await session.close();
  await assert.rejects(readFile(askpass), { code: "ENOENT" });
  await assert.rejects(session.readRemoteHead(), code("git_network_closed"));
});

test("advertised old OID отличается от разрешения: push не обновляет remote", async (t) => {
  const f = await fixture(t);
  const session = await f.open("1".repeat(40));
  t.after(() => session.close());
  await assert.rejects(session.push(), code("git_command_failed"));
  assert.equal(await session.readRemoteHead(), null);
});

test("configured pre-push отказ не обходится", async (t) => {
  const f = await fixture(t);
  await writeFile(
    join(f.local, ".git/hooks/pre-push"),
    "#!/bin/sh\nexit 23\n",
    { mode: 0o700 },
  );
  const session = await f.open();
  t.after(() => session.close());
  await assert.rejects(session.push(), code("git_command_failed"));
  assert.equal(await session.readRemoteHead(), null);
});

test("ошибка HTTPS auth безопасна и не включает token или stderr", async (t) => {
  const f = await fixture(t);
  const session = await f.open(null, {
    ...connection,
    transport: "https",
    token: "synthetic-wrong-token",
  });
  t.after(() => session.close());
  await assert.rejects(
    session.readRemoteHead(),
    (error) =>
      error instanceof GitFailure &&
      !error.message.includes("token") &&
      error.code === "git_command_failed",
  );
  assert.equal(f.authenticated(), 0);
});

test("rewrite и scoped HTTP config отклоняются до сетевого обращения", async (t) => {
  const f = await fixture(t);
  await f.localGit.run([
    "config",
    "url.https://elsewhere.invalid/.insteadOf",
    "https://github.com/",
  ]);
  await assert.rejects(f.open(), code("git_network_configuration_denied"));
  assert.equal(f.requests(), 0);
  await f.localGit.run([
    "config",
    "--remove-section",
    "url.https://elsewhere.invalid/",
  ]);
  await f.localGit.run([
    "config",
    "http.https://github.com/.sslVerify",
    "false",
  ]);
  await assert.rejects(f.open(), code("git_network_configuration_denied"));
  assert.equal(f.requests(), 0);
});

test("network overlay не принимает произвольные env или shell executable", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "realize-git-env-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const git = new FixtureGit(root);
  await assert.rejects(
    git.run(["version"], {
      network: {
        transport: "https",
        askpassPath: "/tmp/askpass",
        token: TOKEN,
        GIT_CONFIG_COUNT: "1",
      } as never,
    }),
    code("git_environment_invalid"),
  );
  await assert.rejects(
    git.run(["version"], {
      network: { transport: "ssh", sshPath: "/tmp/$(forbidden)" },
    }),
    code("git_environment_invalid"),
  );
});

test("HTTPS не использует неявный netrc credential fallback", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "realize-git-netrc-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(
    join(root, ".netrc"),
    "machine github.com login foreign password synthetic\n",
    { mode: 0o600 },
  );
  const previousHome = process.env.HOME;
  process.env.HOME = root;
  try {
    await assert.rejects(
      createGitNetworkSession({
        git: new FixtureGit(root),
        connection,
        expected: {
          branch: "main",
          sourceOid: "a".repeat(40),
          remoteOid: null,
        },
      }),
      code("git_network_configuration_denied"),
    );
  } finally {
    if (previousHome === undefined) delete process.env.HOME;
    else process.env.HOME = previousHome;
  }
});

test("TLS verification нельзя отключить local config", async (t) => {
  const f = await fixture(t, "untrusted");
  await f.localGit.run(["config", "http.sslVerify", "false"]);
  const session = await f.open();
  t.after(() => session.close());
  await assert.rejects(session.readRemoteHead(), code("git_command_failed"));
  assert.equal(f.requests(), 0);
});

test("HTTPS redirect не переносит credentials на другое назначение", async (t) => {
  const f = await fixture(t, "redirect");
  const session = await f.open();
  t.after(() => session.close());
  await assert.rejects(session.readRemoteHead());
  assert.ok(f.requests() > 0);
  assert.equal(f.redirectsFollowed(), 0);
});
