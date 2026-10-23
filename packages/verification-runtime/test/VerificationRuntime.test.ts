/**
 * @file packages/verification-runtime/test/VerificationRuntime.test.ts
 * @version 1.1.1
 * @date 2026-10-23
 * @description Проверяет runtime pins, npm layout и сохранение проверенного Node в окружении дочерних команд.
 */
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { constants } from "node:fs";
import {
  copyFile,
  mkdir,
  mkdtemp,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { test, type TestContext } from "node:test";
import { promisify } from "node:util";
import { readVerificationRuntime } from "../src/readVerificationRuntime.adapter.ts";
import { readVerificationEnvironment } from "../src/readVerificationEnvironment.adapter.ts";
import { runVerification } from "../src/runVerification.service.ts";
import type { VerificationCheck } from "../src/Verification.types.ts";

const execute = promisify(execFile);
const check: VerificationCheck = {
  id: "runtime",
  command: ["node", "-e", "throw Error('must not execute')"],
  inputs: ["package.json"],
  timeoutMs: 1000,
  reuse: "local",
  extent: "targeted",
};
const manifest = {
  engines: { node: process.versions.node, npm: "1.0.0" },
  packageManager: "npm@1.0.0",
};

async function fixture(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), "verification-runtime-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, "package.json"), JSON.stringify(manifest));
  return root;
}

test("runtime pins must be exact and agree with packageManager", async (t) => {
  const root = await fixture(t);
  for (const invalid of [
    {},
    { ...manifest, engines: { ...manifest.engines, node: "24.x" } },
    { ...manifest, packageManager: "npm@2.0.0" },
  ]) {
    await writeFile(join(root, "package.json"), JSON.stringify(invalid));
    await assert.rejects(
      readVerificationRuntime(root, check, { NODE_ENV: "test" }),
      {
        code: "verification_runtime_manifest_invalid",
      },
    );
  }
});

test("wrong Node blocks verification before executing the command", async (t) => {
  const root = await fixture(t);
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({
      ...manifest,
      engines: { ...manifest.engines, node: "0.0.0" },
    }),
  );
  await assert.rejects(
    readVerificationRuntime(root, check, { NODE_ENV: "test" }),
    {
      code: "verification_node_version_mismatch",
      message: /Нужен Node\.js 0\.0\.0; запущен /,
    },
  );
  const result = await runVerification(
    {
      version: 1,
      projectId: "fixture",
      taskId: "runtime",
      repositoryRoot: root,
      checks: [check],
    },
    { storage: { root, directory: ".ai-workspace/verification" } },
  );
  assert.equal(result.success, false);
  assert.equal(result.checks[0].status, "blocked");
  assert.equal(result.checks[0].executed, false);
  assert.equal(result.checks[0].receiptId, null);
  assert.equal(result.checks[0].reason, "verification_node_version_mismatch");
  assert.match(
    result.checks[0].diagnostic ?? "",
    /Нужен Node\.js 0\.0\.0; запущен /,
  );
});

test("node checks require no npm executable", async (t) => {
  const root = await fixture(t);
  const runtime = await readVerificationRuntime(root, check, {
    PATH: root,
    NODE_ENV: "test",
  });
  assert.equal(runtime.executable, process.execPath);
  assert.deepEqual(runtime.prefix, []);
});

test("PATH overrides retain the current Node before all other entries", () => {
  const nodeDirectory = dirname(process.execPath);
  const selected = readVerificationEnvironment({
    ...check,
    inheritEnvironment: ["PATH"],
    environment: {
      PATH: ["/fixture/other-node", nodeDirectory, "/usr/bin"].join(delimiter),
    },
  });
  assert.equal(
    selected.values.PATH,
    [nodeDirectory, "/fixture/other-node", "/usr/bin"].join(delimiter),
  );
  assert.equal(
    selected.digest,
    readVerificationEnvironment({
      ...check,
      environment: { PATH: selected.values.PATH! },
    }).digest,
  );
});

async function npmFixture(t: TestContext, layout: string, version: string) {
  const root = await fixture(t);
  const binary = join(root, "bin/node");
  await mkdir(join(root, "bin"));
  await copyFile(process.execPath, binary, constants.COPYFILE_FICLONE);
  const npmRoot = join(root, layout);
  await mkdir(join(npmRoot, "bin"), { recursive: true });
  await writeFile(join(npmRoot, "package.json"), JSON.stringify({ version }));
  await writeFile(
    join(npmRoot, "bin/npm-cli.js"),
    "throw Error('must not execute')",
  );
  await symlink(join(npmRoot, "bin/npm-cli.js"), join(root, "bin/npm"));
  const moduleURL = new URL(
    "../src/readVerificationRuntime.adapter.ts",
    import.meta.url,
  ).href;
  const source = `const {readVerificationRuntime}=await import(${JSON.stringify(moduleURL)});try {const result=await readVerificationRuntime(${JSON.stringify(root)},{command:['npm','run','fixture']},{PATH:${JSON.stringify(join(root, "bin"))}});console.log(JSON.stringify({prefix:result.prefix}));}catch(error){console.log(JSON.stringify({code:error.code,message:error.message}));}`;
  const { stdout } = await execute(
    binary,
    ["--input-type=module", "-e", source],
    { env: { PATH: join(root, "bin"), NODE_ENV: "test" } },
  );
  return { root, npmRoot, result: JSON.parse(stdout) };
}

test("nonstandard npm package layout fails before its missing inventory can become reusable evidence", async (t) => {
  const { result } = await npmFixture(t, "share/nodejs/npm", "1.0.0");
  assert.equal(result.code, "verification_executable_invalid");
});

test("npm version is checked from the selected package without running its CLI", async (t) => {
  const { result } = await npmFixture(t, "lib/node_modules/npm", "2.0.0");
  assert.equal(result.code, "verification_npm_version_mismatch");
  assert.match(result.message, /Нужен npm 1\.0\.0; выбран 2\.0\.0/);
});

test("matching npm is accepted without running its CLI", async (t) => {
  const { npmRoot, result } = await npmFixture(
    t,
    "lib/node_modules/npm",
    "1.0.0",
  );
  assert.deepEqual(result.prefix, [join(npmRoot, "bin/npm-cli.js")]);
});
