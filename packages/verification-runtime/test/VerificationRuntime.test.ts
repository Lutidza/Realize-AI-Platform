/**
 * @file packages/verification-runtime/test/VerificationRuntime.test.ts
 * @version 1.0.0
 * @date 2026-10-22
 * @description Проверяет отказ неподдерживаемой npm-раскладки через отдельный Node process без глобального toolchain fixture.
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
import { join } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";

const execute = promisify(execFile);

test("nonstandard npm package layout fails before its missing inventory can become reusable evidence", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "verification-npm-layout-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const binary = join(root, "node");
  await copyFile(process.execPath, binary, constants.COPYFILE_FICLONE);
  const npmRoot = join(root, "share/nodejs/npm");
  await mkdir(join(npmRoot, "bin"), { recursive: true });
  await mkdir(join(root, "bin"));
  await writeFile(
    join(npmRoot, "bin/npm-cli.js"),
    "throw Error('must not execute')",
  );
  await symlink(join(npmRoot, "bin/npm-cli.js"), join(root, "bin/npm"));
  const moduleURL = new URL(
    "../src/readVerificationRuntime.adapter.ts",
    import.meta.url,
  ).href;
  const source = `const {readVerificationRuntime}=await import(${JSON.stringify(moduleURL)});try {await readVerificationRuntime({command:['npm','run','fixture']},{PATH:${JSON.stringify(join(root, "bin"))}});process.exitCode=1;}catch(error){console.log(error.code);}`;
  const { stdout } = await execute(
    binary,
    ["--input-type=module", "-e", source],
    { env: { PATH: join(root, "bin"), NODE_ENV: "test" } },
  );
  assert.equal(stdout.trim(), "verification_executable_invalid");
});
