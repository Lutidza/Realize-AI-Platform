/**
 * @file packages/verification-runtime/test/Verification.service.test.ts
 * @version 1.0.0
 * @date 2026-10-23
 * @description Проверяет per-check reuse, receipt lifecycle, отмену и защиту input/dependency proof на disposable workspace.
 */
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  rm,
  symlink,
  access,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import type { TestContext } from "node:test";
import { runVerification } from "../src/runVerification.service.ts";
import { verifyVerification } from "../src/verifyVerification.service.ts";
import { validateVerificationPlan } from "../src/validateVerificationPlan.validator.ts";
import {
  verificationReceiptRepository,
  sealVerificationReceipt,
} from "../src/VerificationReceipt.repository.ts";
import { enumerateVerificationInputs } from "../src/enumerateVerificationInputs.adapter.ts";
import type {
  VerificationPlan,
  VerificationCheck,
  VerificationReceipt,
  VerificationOptions,
} from "../src/Verification.types.ts";

async function fixture(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), "realize-verification-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, "one.txt"), "one");
  await writeFile(join(root, "two.txt"), "two");
  const check = (id: string): VerificationCheck => ({
    id,
    command: [
      "node",
      "-e",
      `require('node:fs').appendFileSync('${id}.count','x')`,
    ],
    inputs: [`${id}.txt`],
    timeoutMs: 3000,
    reuse: "local",
    extent: "targeted",
  });
  const plan: VerificationPlan = {
    version: 1,
    projectId: "fixture",
    taskId: "verification",
    repositoryRoot: root,
    checks: [check("one"), check("two")],
  };
  const count = (id: string) =>
    readFile(join(root, `${id}.count`), "utf8").catch(() => "");
  const options: VerificationOptions = {
    storage: { root, directory: ".ai-workspace/checks" },
  };
  return { root, plan, count, options };
}

async function waitFor(path: string) {
  for (let attempt = 0; attempt < 300; attempt++) {
    if (
      await access(path).then(
        () => true,
        () => false,
      )
    )
      return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Fixture process did not start");
}

test("unchanged receipts skip all processes; one changed input reruns only its check", async (t) => {
  const f = await fixture(t);
  const first = await runVerification(f.plan, f.options);
  assert.equal(first.success, true, JSON.stringify(first));
  const reused = await runVerification(f.plan, f.options);
  assert.equal(reused.success, true);
  assert.deepEqual(
    reused.checks.map((check) => check.executed),
    [false, false],
  );
  assert.equal(await f.count("one"), "x");
  assert.equal(await f.count("two"), "x");
  await writeFile(join(f.root, "one.txt"), "changed");
  const next = await runVerification(f.plan, f.options);
  assert.equal(next.success, true);
  assert.deepEqual(
    next.checks.map((check) => check.executed),
    [true, false],
  );
  assert.equal(await f.count("one"), "xx");
  assert.equal(await f.count("two"), "x");
  assert.deepEqual(
    (await verifyVerification(f.plan, f.options)).checks.map(
      (check) => check.receiptId,
    ),
    next.checks.map((check) => check.receiptId),
  );
});

test("directory additions/deletions and missing inputs invalidate the correct receipt", async (t) => {
  const f = await fixture(t);
  await mkdir(join(f.root, "source"));
  await writeFile(join(f.root, "source/a.ts"), "a");
  f.plan.checks = [{ ...f.plan.checks[0], inputs: ["source", "optional.ts"] }];
  assert.equal((await runVerification(f.plan, f.options)).success, true);
  await writeFile(join(f.root, "source/b.ts"), "b");
  assert.equal(
    (await runVerification(f.plan, f.options)).checks[0].executed,
    true,
  );
  await rm(join(f.root, "source/a.ts"));
  assert.equal(
    (await runVerification(f.plan, f.options)).checks[0].executed,
    true,
  );
  await writeFile(join(f.root, "optional.ts"), "new");
  assert.equal(
    (await runVerification(f.plan, f.options)).checks[0].executed,
    true,
  );
  const paths = await enumerateVerificationInputs(f.plan, f.options);
  assert.ok(paths.includes("source/b.ts"));
  assert.ok(!paths.includes("source"));
  assert.ok(paths.includes("package-lock.json"));
});

test("command, explicit and inherited environment, config and dependency metadata are bound", async (t) => {
  const f = await fixture(t);
  f.plan.checks = [f.plan.checks[0]];
  await mkdir(join(f.root, "node_modules/pkg"), { recursive: true });
  await writeFile(join(f.root, "node_modules/pkg/index.js"), "one");
  await writeFile(join(f.root, "node_modules/.package-lock.json"), "{}");
  const initial = await runVerification(f.plan, f.options);
  assert.equal(initial.success, true);
  f.plan.checks[0].command[2] += ";void 0";
  assert.equal(
    (await runVerification(f.plan, f.options)).checks[0].executed,
    true,
  );
  f.plan.checks[0].environment = { FIXTURE_MODE: "first" };
  assert.equal(
    (await runVerification(f.plan, f.options)).checks[0].executed,
    true,
  );
  const name = `REALIZE_VERIFY_FIXTURE_${process.pid}`;
  const previous = process.env[name];
  t.after(() => {
    if (previous === undefined) delete process.env[name];
    else process.env[name] = previous;
  });
  f.plan.checks[0].inheritEnvironment = [name];
  process.env[name] = "first";
  await runVerification(f.plan, f.options);
  process.env[name] = "second";
  assert.equal(
    (await runVerification(f.plan, f.options)).checks[0].executed,
    true,
  );
  await writeFile(join(f.root, "node_modules/pkg/index.js"), "two");
  assert.equal(
    (await runVerification(f.plan, f.options)).checks[0].executed,
    true,
  );
  await writeFile(join(f.root, "package-lock.json"), "{}");
  assert.equal(
    (await runVerification(f.plan, f.options)).checks[0].executed,
    true,
  );
  await writeFile(join(f.root, ".npmrc"), "fund=false");
  assert.equal(
    (await runVerification(f.plan, f.options)).checks[0].executed,
    true,
  );
});

test("failed/running/corrupt latest receipt never falls back to an old pass", async (t) => {
  const f = await fixture(t);
  f.plan.checks = [f.plan.checks[0]];
  await runVerification(f.plan, f.options);
  const store = verificationReceiptRepository(
    f.plan,
    f.plan.checks[0],
    f.options,
  );
  const passed = (await store.load()) as VerificationReceipt;
  for (const status of ["running", "failed"] as const) {
    const { integrity: _integrity, ...receipt } = passed;
    await store.save(
      sealVerificationReceipt({
        ...receipt,
        status,
        ...(status === "failed"
          ? {
              result: {
                ...receipt.result!,
                status: "failed",
                exitCode: 1,
                reason: "verification_command_failed",
              },
            }
          : {}),
      }),
    );
    assert.equal(
      (await verifyVerification(f.plan, f.options)).checks[0].status,
      status,
    );
    assert.equal(
      (await runVerification(f.plan, f.options)).checks[0].executed,
      true,
    );
  }
  await writeFile(join(f.root, store.relativePath), "not JSON", {
    mode: 0o600,
  });
  assert.equal(
    (await verifyVerification(f.plan, f.options)).checks[0].status,
    "blocked",
  );
  assert.equal(
    (await runVerification(f.plan, f.options)).checks[0].executed,
    true,
  );
});

test("a command mutating its inputs cannot produce a passed receipt", async (t) => {
  const f = await fixture(t);
  f.plan.checks = [
    {
      ...f.plan.checks[0],
      command: [
        "node",
        "-e",
        "require('node:fs').appendFileSync('one.txt','mutation')",
      ],
    },
  ];
  const result = await runVerification(f.plan, f.options);
  assert.equal(result.success, false);
  assert.equal(result.checks[0].reason, "verification_inputs_changed");
  assert.equal(
    (await verifyVerification(f.plan, f.options)).checks[0].status,
    "failed",
  );
});

test("never always executes while readonly status can validate its latest result", async (t) => {
  const f = await fixture(t);
  f.plan.checks = [{ ...f.plan.checks[0], reuse: "never" }];
  await runVerification(f.plan, f.options);
  const second = await runVerification(f.plan, f.options);
  assert.equal(second.checks[0].executed, true);
  assert.equal(await f.count("one"), "xx");
  const status = await verifyVerification(f.plan, f.options);
  assert.equal(status.success, true);
  assert.equal(status.checks[0].reused, false);
});

test("failed command keeps redacted useful diagnostics without environment plaintext", async (t) => {
  const f = await fixture(t);
  const secret = "synthetic-private-value-never-persist";
  f.plan.checks = [
    {
      ...f.plan.checks[0],
      environment: { FIXTURE_PRIVATE: secret },
      command: [
        "node",
        "-e",
        "console.error('Assertion failed: expected 2, actual 3'); console.error(process.env.FIXTURE_PRIVATE); console.error('Bearer synthetic-token'); const url = new URL('https://example.test'); url.username = 'user'; url.password = 'password'; console.error(url.href); console.error(JSON.stringify({token:'json-private-value',password:'json-password-value'})); process.exit(1)",
      ],
    },
  ];
  const result = await runVerification(f.plan, f.options);
  assert.equal(result.success, false);
  const receipt = await readFile(
    join(f.root, result.checks[0].logPath!),
    "utf8",
  );
  assert.ok(receipt.includes("Assertion failed"));
  assert.ok(!receipt.includes(secret));
  assert.ok(!receipt.includes("synthetic-token"));
  assert.ok(!receipt.includes("user:password"));
  assert.ok(!receipt.includes("json-private-value"));
  assert.ok(!receipt.includes("json-password-value"));
});

test("status creates no task directory and unsafe input/config paths fail closed", async (t) => {
  const f = await fixture(t);
  assert.equal(
    (await verifyVerification(f.plan, f.options)).checks[0].status,
    "missing",
  );
  await assert.rejects(access(join(f.root, ".ai-workspace")), {
    code: "ENOENT",
  });
  for (const path of [
    "../outside",
    ".git/config",
    ".ai-workspace/tasks/task",
    "node_modules/pkg",
    "/etc/passwd",
  ])
    assert.throws(() =>
      validateVerificationPlan({
        ...f.plan,
        checks: [{ ...f.plan.checks[0], inputs: [path] }],
      }),
    );
  await symlink("/etc/passwd", join(f.root, "unsafe.txt"));
  f.plan.checks = [{ ...f.plan.checks[0], inputs: ["unsafe.txt"] }];
  assert.equal(
    (await runVerification(f.plan, f.options)).checks[0].status,
    "blocked",
  );
  assert.throws(() =>
    validateVerificationPlan({
      ...f.plan,
      checks: [
        {
          ...f.plan.checks[0],
          environment: { REALIZE_GIT_WORKER_CONTEXT: "forbidden" },
        },
      ],
    }),
  );
});

test("known full commands cannot bypass reason with targeted label", async (t) => {
  const f = await fixture(t);
  for (const command of [
    ["npm", "test"],
    ["npm", "run", "test:int"],
    ["npm", "run", "check"],
    ["npm", "run", "ci"],
    ["node", "--test"],
  ])
    assert.throws(
      () =>
        validateVerificationPlan({
          ...f.plan,
          checks: [{ ...f.plan.checks[0], command }],
        }),
      { code: "verification_full_reason_required" },
    );
  assert.equal(
    validateVerificationPlan({
      ...f.plan,
      checks: [
        {
          ...f.plan.checks[0],
          extent: "full",
          reason: "Проверка полного контракта",
        },
      ],
    }).checks[0].extent,
    "full",
  );
});

test("concurrent same task has one writer; cancellation remains durable", async (t) => {
  const f = await fixture(t);
  const controller = new AbortController();
  f.plan.checks = [
    {
      ...f.plan.checks[0],
      command: [
        "node",
        "-e",
        "require('node:fs').writeFileSync('started','yes');setInterval(()=>{},1000)",
      ],
    },
  ];
  const pending = runVerification(f.plan, {
    ...f.options,
    signal: controller.signal,
  });
  await waitFor(join(f.root, "started"));
  const current = await verifyVerification(f.plan, f.options);
  assert.equal(current.checks[0].status, "running");
  const concurrent = await runVerification(f.plan, f.options);
  assert.equal(concurrent.checks[0].status, "blocked");
  assert.equal(concurrent.checks[0].reason, "repository_locked");
  controller.abort();
  const result = await pending;
  assert.equal(result.checks[0].status, "cancelled");
  assert.equal(
    (await verifyVerification(f.plan, f.options)).checks[0].status,
    "cancelled",
  );
});

test("timeout kills descendants and output limit stores bounded diagnostics", async (t) => {
  const f = await fixture(t);
  f.plan.checks = [
    {
      ...f.plan.checks[0],
      timeoutMs: 100,
      command: [
        "node",
        "-e",
        "const {spawn}=require('node:child_process');const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});require('node:fs').writeFileSync('child.pid',String(child.pid));setInterval(()=>{},1000)",
      ],
    },
  ];
  const result = await runVerification(f.plan, f.options);
  assert.equal(result.checks[0].reason, "verification_timeout");
  const pid = Number(await readFile(join(f.root, "child.pid"), "utf8"));
  await new Promise((resolve) => setTimeout(resolve, 40));
  const state = await readFile(`/proc/${pid}/stat`, "utf8").catch(() => "");
  assert.ok(!state || /\) Z /u.test(state));
  f.plan.checks[0].command = [
    "node",
    "-e",
    "process.stdout.write('x'.repeat(9*1024*1024))",
  ];
  f.plan.checks[0].timeoutMs = 3000;
  assert.equal(
    (await runVerification(f.plan, f.options)).checks[0].reason,
    "verification_output_limit",
  );
});

test("safe workspace dependency symlinks work, external symlinks block reuse", async (t) => {
  const f = await fixture(t);
  f.plan.checks = [f.plan.checks[0]];
  await mkdir(join(f.root, "packages/local"), { recursive: true });
  await writeFile(join(f.root, "packages/local/index.js"), "export default 1");
  await mkdir(join(f.root, "node_modules"));
  await symlink("../packages/local", join(f.root, "node_modules/local"));
  assert.equal((await runVerification(f.plan, f.options)).success, true);
  assert.equal(
    (await runVerification(f.plan, f.options)).checks[0].executed,
    false,
  );
  await symlink("/usr/share", join(f.root, "node_modules/external"));
  assert.equal(
    (await runVerification(f.plan, f.options)).checks[0].reason,
    "verification_dependencies_unsafe",
  );
});

test("generated dependency caches are excluded while source caches and hidden installed lock remain bound", async (t) => {
  const f = await fixture(t);
  f.plan.checks = [f.plan.checks[0]];
  await mkdir(join(f.root, "node_modules/pkg"), { recursive: true });
  await writeFile(join(f.root, "node_modules/pkg/index.js"), "one");
  assert.equal((await runVerification(f.plan, f.options)).success, true);
  await mkdir(join(f.root, "node_modules/.vite"));
  await writeFile(join(f.root, "node_modules/.vite/generated"), "cache");
  assert.equal(
    (await runVerification(f.plan, f.options)).checks[0].executed,
    false,
  );
  await writeFile(join(f.root, "node_modules/.package-lock.json"), "{}");
  assert.equal(
    (await runVerification(f.plan, f.options)).checks[0].executed,
    true,
  );
  await mkdir(join(f.root, "source/.cache"), { recursive: true });
  await writeFile(join(f.root, "source/.cache/actual.ts"), "source");
  f.plan.checks[0].inputs = ["source"];
  await runVerification(f.plan, f.options);
  await writeFile(join(f.root, "source/.cache/actual.ts"), "changed");
  assert.equal(
    (await runVerification(f.plan, f.options)).checks[0].executed,
    true,
  );
});

test("later check mutation invalidates an earlier passed result in the same run", async (t) => {
  const f = await fixture(t);
  f.plan.checks[1].command = [
    "node",
    "-e",
    "require('node:fs').appendFileSync('one.txt','changed-by-other-check')",
  ];
  const result = await runVerification(f.plan, f.options);
  assert.equal(result.success, false);
  assert.equal(result.checks[0].status, "stale");
  assert.equal(result.checks[1].status, "passed");
});

test("shared runner package and adapter inputs invalidate receipts", async (t) => {
  const f = await fixture(t);
  f.plan.checks = [f.plan.checks[0]];
  assert.equal((await runVerification(f.plan, f.options)).success, true);
  await mkdir(join(f.root, "packages/verification-runtime"), {
    recursive: true,
  });
  f.options.additionalInputs = ["packages/verification-runtime/adapter.json"];
  for (const filename of ["package.json", "adapter.json"]) {
    await writeFile(
      join(f.root, "packages/verification-runtime", filename),
      "{}",
    );
    const next = await runVerification(f.plan, f.options);
    assert.equal(next.success, true);
    assert.equal(next.checks[0].executed, true);
  }
  assert.equal(
    (await runVerification(f.plan, f.options)).checks[0].executed,
    false,
  );
});
