/**
 * @file .ai/tools/git-delivery/test/runVerifiedGitWorker.service.test.ts
 * @version 1.1.1
 * @date 2026-11-26
 * @description Проверяет autoload receipts, границы разрешений и exact-OID proof без Git, Codex и внешних checks.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { emptyResult } from "../src/emptyResult.util.ts";
import type { Context } from "../src/GitDelivery.types.ts";
import type { GitPushContext } from "../src/push/GitPush.types.ts";
import {
  type VerificationPlan,
  type VerificationReport,
  type VerificationOptions,
  hashVerificationRecipe,
  validateVerificationPlan,
  verifyVerification,
} from "@realize/verification-runtime";
import type {
  GitWorkerDependencies,
  GitWorkerReport,
} from "../src/worker/GitWorker.types.ts";
import { runVerifiedGitWorker } from "../src/worker/runVerifiedGitWorker.service.ts";
import { parseGitWorkerCommand } from "../src/worker/parseGitWorkerCommand.validator.ts";
import { loadGitWorkerContext } from "../src/worker/loadGitWorkerContext.adapter.ts";
import { validateGitWorkerContext } from "../src/worker/validateGitWorkerContext.validator.ts";
import { GitVerificationCommitProofRepository } from "../src/worker/verification/GitVerificationCommitProof.repository.ts";
import type { GitWorkerVerificationDependencies } from "../src/worker/verification/GitWorkerVerification.types.ts";
import { gitVerificationOptions } from "../src/worker/verification/gitVerificationOptions.config.ts";

const commit = "a".repeat(40);
const fingerprint = "b".repeat(64);
const key = "c".repeat(64);

async function fixture(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), "git-verification-worker-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({
      engines: { node: process.versions.node, npm: "1.0.0" },
      packageManager: "npm@1.0.0",
    }),
  );
  const contextPath = join(root, "context.json");
  const planPath = join(root, "plan.json");
  const context: Context = {
    version: 1,
    requestId: "request-1",
    projectId: "project-1",
    taskId: randomUUID(),
    repositoryRoot: root,
    authorization: {
      actions: ["commit"],
      scope: { mode: "paths", paths: ["owned.txt"] },
    },
    identity: { name: "Fixture", email: "fixture@example.invalid" },
    verification: {
      inputPaths: ["config.json"],
      requiredChecks: ["unit"],
      results: [],
    },
  };
  const plan: VerificationPlan = {
    version: 1,
    projectId: context.projectId,
    taskId: context.taskId,
    repositoryRoot: root,
    checks: [
      {
        id: "unit",
        command: ["node", "fixture.test.mjs"],
        inputs: ["owned.txt"],
        timeoutMs: 1000,
        reuse: "local",
        extent: "targeted",
      },
      {
        id: "irrelevant",
        command: ["node", "other.test.mjs"],
        inputs: ["other.txt"],
        timeoutMs: 1000,
        reuse: "local",
        extent: "targeted",
      },
    ],
  };
  const saveContext = (value: unknown = context) =>
    writeFile(contextPath, JSON.stringify(value), { mode: 0o600 });
  const savePlan = () =>
    writeFile(planPath, JSON.stringify(plan), { mode: 0o600 });
  await saveContext({
    ...context,
    verification: {
      inputPaths: context.verification!.inputPaths,
      requiredChecks: ["unit"],
    },
  });
  await savePlan();
  const events: string[] = [];
  const verificationOptions: VerificationOptions[] = [];
  const seen: Context[] = [];
  const state = {
    inspected: fingerprint,
    after: fingerprint,
    receiptStatus: "passed" as VerificationReport["checks"][number]["status"],
    verifyKey: key,
    workerStatus: "succeeded" as GitWorkerReport["status"],
    commitStatus: "succeeded" as NonNullable<
      GitWorkerReport["result"]
    >["status"],
    commitCreated: true as boolean | null,
    commitFingerprint: fingerprint,
    executed: true,
  };
  const receipt = (
    selected: VerificationPlan,
    checkKey = key,
  ): VerificationReport => ({
    version: 1,
    projectId: selected.projectId,
    taskId: selected.taskId,
    success: state.receiptStatus === "passed",
    checks: selected.checks.map((check) => ({
      id: check.id,
      status: state.receiptStatus,
      executed: state.executed,
      reused: !state.executed,
      key: checkKey,
      recipeKey: hashVerificationRecipe(check),
      receiptId: "receipt-1",
    })),
  });
  const workerDependencies: GitWorkerDependencies = {
    createTransport() {
      throw new Error("Real transport must not run");
    },
    async deliver(command, supplied) {
      assert.deepEqual(command, { action: "inspect" });
      validateGitWorkerContext("inspect", supplied);
      events.push("inspect");
      seen.push(structuredClone(supplied) as Context);
      const inspected = events.filter((event) => event === "inspect").length;
      return {
        ...emptyResult(),
        requestId: supplied.requestId,
        action: "inspect",
        status: "succeeded",
        commit,
        fingerprint: inspected % 2 ? state.inspected : state.after,
      };
    },
  };
  const dependencies: GitWorkerVerificationDependencies = {
    async enumerateInputs(input, options) {
      verificationOptions.push(options);
      const selected = validateVerificationPlan(input);
      assert.deepEqual(
        selected.checks.map((check) => check.id),
        ["unit"],
      );
      return ["owned.txt", "runner.ts", "config.json"];
    },
    async runVerification(selected, options) {
      verificationOptions.push(options);
      events.push("run");
      assert.deepEqual(
        (selected as VerificationPlan).checks.map((check) => check.id),
        ["unit"],
      );
      return receipt(selected as VerificationPlan);
    },
    async verifyVerification(selected, options) {
      verificationOptions.push(options);
      events.push("verify");
      return receipt(selected as VerificationPlan, state.verifyKey);
    },
    async loadSettings(_root, action) {
      assert.notEqual(
        action,
        "inspect",
        "Снимок не загружает модельный профиль",
      );
      return {
        model: "fixture-" + action,
        instructions: "fixture",
        reasoningEffort: "low",
        timeoutMs: 1000,
      };
    },
    async runWorker(input, supplied, settings, ports) {
      const command = parseGitWorkerCommand(input);
      assert.notEqual(command.action, "inspect", "Снимок не запускает модель");
      assert.equal(ports, workerDependencies);
      assert.equal(settings.model, "fixture-" + command.action);
      validateGitWorkerContext(command.action, supplied);
      events.push(command.action);
      seen.push(structuredClone(supplied) as Context);
      const inspected = events.filter((event) => event === "inspect").length;
      const result = {
        ...emptyResult(),
        requestId: supplied.requestId,
        action: command.action as "inspect" | "commit" | "push",
        status:
          command.action === "commit"
            ? state.commitStatus
            : ("succeeded" as const),
        commit,
        commitCreated:
          command.action === "commit" ? state.commitCreated : false,
        fingerprint:
          command.action === "commit"
            ? state.commitFingerprint
            : inspected % 2
              ? state.inspected
              : state.after,
      };
      return {
        version: 1,
        status: command.action === "commit" ? state.workerStatus : "succeeded",
        errorCode: null,
        result,
        command,
        worker: {
          model: settings.model,
          threadId: "fixture",
          turnId: "fixture",
          durationMs: 1,
          handlerCalls: 1,
          instructionBytes: 7,
          usage: null,
        },
      };
    },
  };
  const run = (action: "commit" | "push" = "commit") =>
    runVerifiedGitWorker(
      { action, ...(action === "commit" ? { message: "fixture commit" } : {}) },
      root,
      contextPath,
      planPath,
      workerDependencies,
      undefined,
      dependencies,
    );
  const pushContext = (commits = [commit]): GitPushContext => ({
    version: 1,
    requestId: "push-1",
    projectId: context.projectId,
    taskId: context.taskId,
    repositoryRoot: root,
    authorization: { actions: ["push"], scope: { mode: "commits", commits } },
    target: {
      connectionKey: "github:primary",
      connectionRevision: 1,
      repositorySlug: "fixture/project",
      transport: "https",
      branch: "main",
      sourceOid: commit,
      remoteOid: null,
    },
    verification: { requiredChecks: ["unit"], results: [] },
  });
  return {
    root,
    context,
    plan,
    contextPath,
    planPath,
    saveContext,
    savePlan,
    run,
    pushContext,
    events,
    seen,
    state,
    dependencies,
    verificationOptions,
  };
}

test("commit выбирает required checks, усиливает snapshot и сохраняет immutable proof; push не проверяет current files", async (t) => {
  const f = await fixture(t);
  const report = await f.run();
  assert.equal(report.status, "succeeded");
  assert.deepEqual(f.events, ["run", "inspect", "verify", "inspect", "commit"]);
  const delivered = f.seen.at(-1)!;
  assert.deepEqual(delivered.authorization, f.context.authorization);
  assert.deepEqual(delivered.identity, f.context.identity);
  assert.deepEqual(delivered.verification!.inputPaths, [
    "config.json",
    "owned.txt",
    "runner.ts",
  ]);
  assert.deepEqual(delivered.verification!.results, [
    { id: "unit", status: "passed", fingerprint },
  ]);
  const proof = await new GitVerificationCommitProofRepository(
    f.context,
  ).readCommit(commit);
  assert.equal(proof?.checks[0].key, key);
  await writeFile(join(f.root, "owned.txt"), "different current bytes");
  await f.saveContext(f.pushContext());
  const before = f.events.length;
  assert.equal((await f.run("push")).status, "succeeded");
  assert.deepEqual(f.events.slice(before), ["push"]);
});

test("IDE назначает одинаковую private storage policy и owner inputs всем операциям общего runner", async (t) => {
  const f = await fixture(t);
  assert.equal((await f.run()).status, "succeeded");
  assert.equal(f.verificationOptions.length, 5);
  const options = f.verificationOptions[0];
  for (const current of f.verificationOptions) assert.equal(current, options);
  assert.deepEqual(options.storage, {
    root: f.root,
    directory: `.ai-workspace/tasks/${f.context.taskId}/logs/git-verification`,
  });
  assert.equal(options.portability, "workspace");
  assert.ok(
    options.additionalInputs?.includes(".ai/tools/git-delivery/package.json"),
  );
  assert.ok(
    options.additionalInputs?.includes(".ai/tools/git-delivery/tsconfig.json"),
  );
  assert.ok(
    options.additionalInputs?.includes(
      ".ai/tools/git-delivery/src/worker/verification",
    ),
  );
  assert.ok(
    options.additionalInputs?.includes(
      ".ai/tools/git-delivery/src/verification/runGitVerification.controller.ts",
    ),
  );
  assert.ok(
    options.additionalInputs?.includes(
      ".ai/tools/git-delivery/src/worker/runGitInspect.service.ts",
    ),
  );
});

test("IDE ограничивает union snapshot inputs до 2048 до запуска общего runner", async (t) => {
  const f = await fixture(t);
  f.dependencies.enumerateInputs = async () =>
    Array.from({ length: 2048 }, (_, index) => `source-${index}.ts`);
  await assert.rejects(f.run(), { code: "verification_input_limit" });
  assert.deepEqual(f.events, []);
});

test("authorization, root и plan binding проверяются до checks/модели", async (t) => {
  for (const change of ["authorization", "root", "plan", "required"] as const)
    await t.test(change, async (child) => {
      const f = await fixture(child);
      if (change === "authorization")
        f.context.authorization.actions = ["inspect"];
      if (change === "root") f.context.repositoryRoot = tmpdir();
      if (change === "required") f.context.verification!.requiredChecks = [];
      if (change === "plan") {
        f.plan.taskId = "other";
        await f.savePlan();
      }
      await f.saveContext();
      await assert.rejects(f.run());
      assert.deepEqual(f.events, []);
    });
});

test("failed receipt, смена key и изменение snapshot не допускают commit", async (t) => {
  for (const change of ["failed", "key", "snapshot"] as const)
    await t.test(change, async (child) => {
      const f = await fixture(child);
      if (change === "failed") f.state.receiptStatus = "failed";
      if (change === "key") f.state.verifyKey = "d".repeat(64);
      if (change === "snapshot") f.state.after = "e".repeat(64);
      await assert.rejects(f.run(), { code: "checks_stale_or_missing" });
      assert.ok(!f.events.includes("commit"));
      assert.equal(
        await new GitVerificationCommitProofRepository(f.context).readCommit(
          commit,
        ),
        null,
      );
    });
});

test("failed, unknown и no-change результаты commit не создают OID proof", async (t) => {
  for (const result of ["failed", "unknown", "no-change"] as const)
    await t.test(result, async (child) => {
      const f = await fixture(child);
      if (result === "failed") f.state.workerStatus = "failed";
      if (result === "unknown") {
        f.state.commitStatus = "partial";
        f.state.commitCreated = null;
      }
      if (result === "no-change") {
        f.state.commitStatus = "noop";
        f.state.commitCreated = false;
      }
      await f.run();
      assert.equal(
        await new GitVerificationCommitProofRepository(f.context).readCommit(
          commit,
        ),
        null,
      );
    });
});

test("подтверждённый recovered noop использует сохранённую attestation исходного fingerprint", async (t) => {
  const f = await fixture(t);
  f.state.workerStatus = "failed";
  await f.run();
  assert.equal(
    await new GitVerificationCommitProofRepository(f.context).readCommit(
      commit,
    ),
    null,
  );
  f.state.workerStatus = "succeeded";
  f.state.commitStatus = "noop";
  f.state.inspected = f.state.after = "d".repeat(64);
  const report = await f.run();
  assert.equal(report.status, "succeeded");
  assert.equal(
    (
      await new GitVerificationCommitProofRepository(f.context).readCommit(
        commit,
      )
    )?.fingerprint,
    fingerprint,
  );
});

test("неизвестный старый fingerprint не получает fabricated proof; подтверждённый commit result сохранён", async (t) => {
  const f = await fixture(t);
  f.state.commitStatus = "noop";
  f.state.commitFingerprint = "e".repeat(64);
  const report = await f.run();
  assert.equal(report.errorCode, "verification_commit_proof_missing");
  assert.equal(report.status, "blocked");
  assert.equal(report.result?.commit, commit);
  assert.equal(report.result?.status, "noop");
  assert.equal(
    await new GitVerificationCommitProofRepository(f.context).readCommit(
      commit,
    ),
    null,
  );
});

test("push требует proof для каждого exact OID и совпадение recipe", async (t) => {
  for (const change of ["oid", "recipe"] as const)
    await t.test(change, async (child) => {
      const f = await fixture(child);
      await f.run();
      if (change === "recipe") {
        f.plan.checks[0].command.push("changed");
        await f.savePlan();
      }
      await f.saveContext(
        f.pushContext(change === "oid" ? [commit, "d".repeat(40)] : [commit]),
      );
      const before = f.events.length;
      await assert.rejects(f.run("push"), {
        code: "verification_commit_proof_missing",
      });
      assert.equal(f.events.length, before);
    });
});

test("never требует текущий run и запрещает автоматический push до модели", async (t) => {
  const f = await fixture(t);
  f.plan.checks[0].reuse = "never";
  await f.savePlan();
  f.state.executed = false;
  await assert.rejects(f.run(), { code: "checks_stale_or_missing" });
  f.state.executed = true;
  assert.equal((await f.run()).status, "succeeded");
  await f.saveContext(f.pushContext());
  const before = f.events.length;
  await assert.rejects(f.run("push"), { code: "verification_not_reusable" });
  assert.equal(f.events.length, before);
});

test("небезопасный plan и повреждённый commit proof отклоняются", async (t) => {
  for (const change of ["permissions", "symlink", "proof"] as const)
    await t.test(change, async (child) => {
      const f = await fixture(child);
      if (change === "permissions") await chmod(f.planPath, 0o644);
      if (change === "symlink") {
        await rm(f.planPath);
        await symlink(f.contextPath, f.planPath);
      }
      if (change === "proof") {
        await f.run();
        const path = join(
          f.root,
          ".ai-workspace/tasks",
          f.context.taskId,
          "logs/git-verification",
          `commit-${commit}.json`,
        );
        const proof = JSON.parse(await readFile(path, "utf8"));
        await writeFile(
          path,
          JSON.stringify({ ...proof, commit: "d".repeat(40) }),
        );
        await f.saveContext(f.pushContext());
      }
      const before = f.events.length;
      await assert.rejects(f.run(change === "proof" ? "push" : "commit"));
      assert.equal(f.events.length, before);
    });
});

test("loader не допускает расширения authorization из receipt resolver", async (t) => {
  const f = await fixture(t);
  await assert.rejects(
    loadGitWorkerContext("commit", f.root, f.contextPath, {
      async prepareVerification(context) {
        context.authorization.scope = { mode: "all" };
        return context;
      },
    }),
    { code: "verification_scope_changed" },
  );
});

test("loader не допускает замены requiredChecks до автора или модели", async (t) => {
  for (const requiredChecks of [[], ["other"]])
    await t.test(JSON.stringify(requiredChecks), async (child) => {
      const f = await fixture(child);
      delete f.context.identity;
      await f.saveContext();
      let authorCalls = 0;
      await assert.rejects(
        loadGitWorkerContext("commit", f.root, f.contextPath, {
          async prepareVerification(context) {
            context.verification!.requiredChecks = requiredChecks;
            return context;
          },
          async resolveCommitAuthor() {
            authorCalls += 1;
            throw new Error("Must not resolve author");
          },
        }),
      );
      assert.equal(authorCalls, 0);
      assert.deepEqual(f.events, []);
    });
});

test("новый directory input вне scope обнаруживается после verify или второго inspect", async (t) => {
  for (const at of [2, 3])
    await t.test(String(at), async (child) => {
      const f = await fixture(child);
      let enumerations = 0;
      f.dependencies.enumerateInputs = async () =>
        ++enumerations >= at ? ["owned.txt", "new-file.ts"] : ["owned.txt"];
      await assert.rejects(f.run(), { code: "checks_stale_or_missing" });
      assert.ok(!f.events.includes("commit"));
    });
});

test("общий runner повторно использует IDE receipt и инвалидирует его при изменении обязательного config", async (t) => {
  const f = await fixture(t);
  await writeFile(join(f.root, "owned.txt"), "unchanged source\n");
  await writeFile(
    join(f.root, "fixture.test.mjs"),
    'import { mkdirSync, readFileSync, writeFileSync } from "node:fs";\n' +
      'mkdirSync(".ai-workspace", { recursive: true });\n' +
      'let count = 0; try { count = Number(readFileSync(".ai-workspace/fixture-runs", "utf8")); } catch {}\n' +
      'writeFileSync(".ai-workspace/fixture-runs", String(count + 1));\n',
  );
  f.plan.checks[0].inputs.push("fixture.test.mjs");
  await f.savePlan();
  delete f.dependencies.runVerification;
  delete f.dependencies.verifyVerification;
  delete f.dependencies.enumerateInputs;
  assert.equal((await f.run()).status, "succeeded");
  f.state.commitStatus = "noop";
  assert.equal((await f.run()).status, "succeeded");
  assert.equal(
    await readFile(join(f.root, ".ai-workspace/fixture-runs"), "utf8"),
    "1",
  );
  await mkdir(join(f.root, ".ai/tools/git-delivery"), { recursive: true });
  await writeFile(join(f.root, ".ai/tools/git-delivery/tsconfig.json"), "{}\n");
  const selected = { ...f.plan, checks: [f.plan.checks[0]] };
  const status = await verifyVerification(
    selected,
    gitVerificationOptions(selected),
  );
  assert.equal(status.success, false);
  assert.equal(status.checks[0].status, "stale");
  assert.equal(
    await readFile(join(f.root, ".ai-workspace/fixture-runs"), "utf8"),
    "1",
  );
});
