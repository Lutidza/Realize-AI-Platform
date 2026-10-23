/**
 * @file packages/verification-runtime/test/VerificationProcess.test.ts
 * @version 1.0.0
 * @date 2026-10-22
 * @description Проверяет process close, точную диагностику и завершение потомков после раннего выхода корневого процесса.
 */
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { runVerificationProcess } from "../src/runVerificationProcess.adapter.ts";
import type {
  VerificationCheck,
  VerificationCheckpoint,
} from "../src/Verification.types.ts";

async function fixture(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), "realize-verification-process-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const checkpoint: VerificationCheckpoint = {
    digest: "fixture",
    environment: { values: { NODE_ENV: "test", CI: "1" }, digest: "fixture" },
    runtime: { executable: process.execPath, prefix: [], digest: "fixture" },
  };
  const run = (source: string, timeoutMs = 3000) => {
    const check: VerificationCheck = {
      id: "process",
      command: ["node", "-e", source],
      inputs: ["source.ts"],
      timeoutMs,
      reuse: "never",
      extent: "targeted",
      environment: { NODE_ENV: "test", CI: "1" },
    };
    return runVerificationProcess(root, check, checkpoint, {
      storage: { root, directory: "receipts" },
    });
  };
  return { root, checkpoint, run };
}

test("close retains late inherited-pipe output and persisted diagnostics normalize workspace paths", async (t) => {
  const f = await fixture(t);
  const result = await f.run(
    "console.log(process.cwd());require('node:child_process').spawn(process.execPath,['-e',`setTimeout(()=>console.log('late test output 1 2'),100)`],{stdio:'inherit'}).unref();process.exit(0)",
  );
  assert.equal(result.status, "passed");
  assert.match(result.diagnostic, /late test output 1 2/u);
  assert.match(result.diagnostic, /\[workspace\]/u);
  assert.ok(!result.diagnostic.includes(f.root));
});

test("exit 137 remains an exit diagnostic rather than guessed OOM or timeout", async (t) => {
  const f = await fixture(t);
  const result = await f.run(
    "console.error('fixture failure');process.exit(137)",
  );
  assert.equal(result.status, "failed");
  assert.equal(result.exitCode, 137);
  assert.equal(result.signal, null);
  assert.equal(result.timedOut, false);
  assert.equal(result.reason, "verification_command_failed");
  assert.doesNotMatch(result.diagnostic, /OOM/u);
});

test("spawn failure closes safely without a live process identifier", async (t) => {
  const f = await fixture(t);
  f.checkpoint.runtime.executable = join(f.root, "missing-node");
  const result = await f.run("void 0");
  assert.equal(result.status, "failed");
  assert.equal(result.reason, "verification_process_unavailable");
});

test("timeout grace kills a stubborn descendant even after the root exits on SIGTERM", async (t) => {
  const f = await fixture(t);
  const source =
    "const c=require('node:child_process').spawn(process.execPath,['-e',`process.on('SIGTERM',()=>{});require('node:fs').writeFileSync('child.pid',String(process.pid));setInterval(()=>{},1000)`],{stdio:'ignore'});process.on('SIGTERM',()=>process.exit(0));setInterval(()=>{},1000)";
  const started = Date.now();
  const result = await f.run(source, 500);
  assert.equal(result.status, "failed");
  assert.equal(result.timedOut, true);
  assert.equal(result.reason, "verification_timeout");
  assert.ok(Date.now() - started >= 2400);
  const pid = Number(await readFile(join(f.root, "child.pid"), "utf8"));
  await new Promise((resolve) => setTimeout(resolve, 30));
  const state = await readFile(`/proc/${pid}/stat`, "utf8").catch(() => "");
  assert.ok(!state || /\) Z /u.test(state));
});
