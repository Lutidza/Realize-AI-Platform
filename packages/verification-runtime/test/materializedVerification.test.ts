/**
 * @file packages/verification-runtime/test/materializedVerification.test.ts
 * @version 1.0.2
 * @date 2026-11-04
 * @description Проверяет reuse между эквивалентными worktrees, непрозрачность materializer и границы source inventory.
 */
import assert from "node:assert/strict";
import {
  access,
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
import {
  materializeVerificationDependencies,
  runVerification,
  verifyVerification,
  enumerateVerificationInputs,
} from "../src/verificationRuntime.server.index.ts";
import type {
  VerificationPlan,
  VerificationOptions,
  VerificationDependencyLease,
} from "../src/Verification.types.ts";
import { assertVerificationOwner } from "../src/assertVerificationOwner.adapter.ts";

async function fixture(t: TestContext) {
  const base = await mkdtemp(join(tmpdir(), "realize-shared-verification-"));
  t.after(() => rm(base, { recursive: true, force: true }));
  const host = join(base, "host"),
    first = join(base, "first"),
    second = join(base, "second");
  for (const root of [host, first, second]) {
    await mkdir(root);
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({
        engines: { node: process.versions.node, npm: "1.0.0" },
        packageManager: "npm@1.0.0",
      }),
    );
  }
  await mkdir(join(host, "node_modules/pkg"), { recursive: true });
  await writeFile(join(host, "node_modules/pkg/index.js"), "module.exports=1");
  for (const root of [first, second])
    await writeFile(join(root, "source.txt"), "same source");
  const plan = (root: string): VerificationPlan => ({
    version: 1,
    projectId: "project",
    taskId: "task",
    repositoryRoot: root,
    checks: [
      {
        id: "one",
        command: [
          "node",
          "-e",
          "const f=require('node:fs');f.mkdirSync('.ai-workspace',{recursive:true});f.appendFileSync('.ai-workspace/count','x')",
        ],
        inputs: ["."],
        excludeInputs: [".next"],
        timeoutMs: 3000,
        reuse: "local",
        extent: "targeted",
      },
    ],
  });
  const options = (
    lease: VerificationDependencyLease,
  ): VerificationOptions => ({
    storage: { root: host, directory: ".ai-workspace/receipts" },
    portability: "content",
    dependencyLease: lease,
  });
  const count = (root: string) =>
    readFile(join(root, ".ai-workspace/count"), "utf8").catch(() => "");
  return { host, first, second, plan, options, count };
}

test("equivalent copied worktrees reuse original evidence; project/task scope remains separate", async (t) => {
  const f = await fixture(t);
  const first = await runVerification(
    f.plan(f.first),
    f.options(await materializeVerificationDependencies(f.host, f.first)),
  );
  assert.equal(first.success, true, JSON.stringify(first));
  const secondOptions = f.options(
    await materializeVerificationDependencies(f.host, f.second),
  );
  const reused = await runVerification(f.plan(f.second), secondOptions);
  assert.equal(reused.success, true, JSON.stringify(reused));
  assert.equal(reused.checks[0].executed, false);
  assert.equal(reused.checks[0].reused, true);
  assert.deepEqual(reused.checks[0].evidence, first.checks[0].evidence);
  assert.equal(await f.count(f.first), "x");
  assert.equal(await f.count(f.second), "");
  assert.equal(
    (
      await runVerification(
        { ...f.plan(f.second), projectId: "other-project" },
        secondOptions,
      )
    ).checks[0].executed,
    true,
  );
  assert.equal(
    (
      await runVerification(
        { ...f.plan(f.second), taskId: "other-task" },
        secondOptions,
      )
    ).checks[0].executed,
    true,
  );
});

test("forged/wrong-root/changed/removed dependencies cannot authorize reuse", async (t) => {
  const f = await fixture(t);
  const lease = await materializeVerificationDependencies(f.host, f.first);
  assert.equal(
    (
      await runVerification(
        f.plan(f.first),
        f.options({} as VerificationDependencyLease),
      )
    ).checks[0].reason,
    "verification_dependency_lease_invalid",
  );
  assert.equal(
    (await runVerification(f.plan(f.second), f.options(lease))).checks[0]
      .reason,
    "verification_dependency_lease_invalid",
  );
  assert.equal(
    (await runVerification(f.plan(f.first), f.options(lease))).success,
    true,
  );
  await writeFile(
    join(f.first, "node_modules/pkg/index.js"),
    "module.exports=2",
  );
  assert.equal(
    (await verifyVerification(f.plan(f.first), f.options(lease))).checks[0]
      .reason,
    "verification_dependencies_changed",
  );
  await rm(join(f.first, "node_modules"), { recursive: true });
  assert.equal(
    (await runVerification(f.plan(f.first), f.options(lease))).checks[0].reason,
    "verification_dependencies_changed",
  );
  await assert.rejects(
    runVerification(f.plan(f.first), {
      storage: { root: f.host, directory: "receipts" },
      portability: "content",
    }),
    { code: "verification_dependency_lease_invalid" },
  );
});

test("root inventory binds new top-level files; exclusions cannot remove host additional inputs", async (t) => {
  const f = await fixture(t);
  const options = f.options(
    await materializeVerificationDependencies(f.host, f.first),
  );
  options.additionalInputs = [".next/types"];
  await mkdir(join(f.first, ".next/types"), { recursive: true });
  await writeFile(join(f.first, ".next/types/routes.ts"), "one");
  assert.equal((await runVerification(f.plan(f.first), options)).success, true);
  await writeFile(join(f.first, ".next/build-cache"), "ignored");
  assert.equal(
    (await runVerification(f.plan(f.first), options)).checks[0].executed,
    false,
  );
  await writeFile(join(f.first, "new-top-level.txt"), "new");
  assert.equal(
    (await runVerification(f.plan(f.first), options)).checks[0].executed,
    true,
  );
  await writeFile(join(f.first, ".next/types/routes.ts"), "two");
  assert.equal(
    (await runVerification(f.plan(f.first), options)).checks[0].executed,
    true,
  );
  const paths = await enumerateVerificationInputs(f.plan(f.first), options);
  assert.ok(paths.includes("new-top-level.txt"));
  assert.ok(paths.includes(".next/types/routes.ts"));
  assert.ok(!paths.some((path) => path.startsWith(".ai-workspace/")));
  assert.ok(!paths.includes(".next/build-cache"));
});

test("workspace package symlink sources stay bound in content mode", async (t) => {
  const f = await fixture(t);
  for (const root of [f.host, f.first, f.second]) {
    await mkdir(join(root, "packages/pkg"), { recursive: true });
    await writeFile(join(root, "packages/pkg/package.json"), '{"name":"pkg"}');
    await writeFile(
      join(root, "packages/pkg/index.js"),
      root === f.second ? "changed" : "original",
    );
  }
  await symlink("../packages/pkg", join(f.host, "node_modules/local"));
  const plan = f.plan(f.first);
  plan.checks[0].inputs = ["source.txt"];
  assert.equal(
    (
      await runVerification(
        plan,
        f.options(await materializeVerificationDependencies(f.host, f.first)),
      )
    ).success,
    true,
  );
  const secondPlan = { ...plan, repositoryRoot: f.second };
  assert.equal(
    (
      await runVerification(
        secondPlan,
        f.options(await materializeVerificationDependencies(f.host, f.second)),
      )
    ).checks[0].executed,
    true,
  );
  await access(join(f.first, "node_modules/local/index.js"));
});

test("host workspace package links absent from the target revision are omitted", async (t) => {
  const f = await fixture(t);
  await mkdir(join(f.host, "packages/pkg"), { recursive: true });
  await writeFile(join(f.host, "packages/pkg/package.json"), '{"name":"pkg"}');
  await writeFile(join(f.host, "packages/pkg/index.js"), "host version");
  await symlink("../packages/pkg", join(f.host, "node_modules/local"));

  const lease = await materializeVerificationDependencies(f.host, f.first);
  await assert.rejects(access(join(f.first, "node_modules/local")), {
    code: "ENOENT",
  });
  assert.equal(
    (await runVerification(f.plan(f.first), f.options(lease))).success,
    true,
  );
});

test("only an absent packages/<name> root is omitted", async (t) => {
  const f = await fixture(t);
  await mkdir(join(f.host, "packages/pkg"), { recursive: true });
  await writeFile(join(f.host, "packages/pkg/package.json"), '{"name":"pkg"}');
  await writeFile(join(f.host, "packages/pkg/index.js"), "host version");
  await symlink("../packages/pkg", join(f.host, "node_modules/local"));
  await mkdir(join(f.first, "packages/shared"), { recursive: true });
  const lease = await materializeVerificationDependencies(f.host, f.first);
  await assert.rejects(access(join(f.first, "node_modules/local")), {
    code: "ENOENT",
  });
  assert.equal(
    (await runVerification(f.plan(f.first), f.options(lease))).success,
    true,
  );
});

test("nested host package targets are retained and rejected when absent from target", async (t) => {
  const f = await fixture(t);
  await mkdir(join(f.host, "packages/pkg/src"), { recursive: true });
  await writeFile(join(f.host, "packages/pkg/package.json"), '{"name":"pkg"}');
  await writeFile(join(f.host, "packages/pkg/src/index.js"), "host source");
  await symlink("../packages/pkg/src", join(f.host, "node_modules/nested"));

  await assert.rejects(materializeVerificationDependencies(f.host, f.first), {
    code: "verification_dependencies_unsafe",
  });
});

test("dangling workspace package links are rejected", async (t) => {
  const f = await fixture(t);
  await symlink("../packages/missing", join(f.host, "node_modules/dangling"));
  await assert.rejects(materializeVerificationDependencies(f.host, f.first));
});

test("external workspace package links are not omitted", async (t) => {
  const f = await fixture(t);
  const external = await mkdtemp(join(tmpdir(), "realize-external-package-"));
  t.after(() => rm(external, { recursive: true, force: true }));
  await mkdir(external, { recursive: true });
  await writeFile(join(external, "package.json"), '{"name":"outside"}');
  await writeFile(join(external, "index.js"), "external package");
  await symlink(external, join(f.host, "node_modules/external"));
  await assert.rejects(materializeVerificationDependencies(f.host, f.first));
});

test("existing target package symlink is preserved for a safe internal target", async (t) => {
  const f = await fixture(t);
  await mkdir(join(f.host, "packages/pkg"), { recursive: true });
  await writeFile(join(f.host, "packages/pkg/package.json"), '{"name":"pkg"}');
  await writeFile(join(f.host, "packages/pkg/index.js"), "host package");
  await symlink("../packages/pkg", join(f.host, "node_modules/local"));
  await mkdir(join(f.first, "packages/shared"), { recursive: true });
  await writeFile(
    join(f.first, "packages/shared/package.json"),
    '{"name":"shared"}',
  );
  await writeFile(join(f.first, "packages/shared/index.js"), "target package");
  await symlink("shared", join(f.first, "packages/pkg"));

  const lease = await materializeVerificationDependencies(f.host, f.first);
  const plan = f.plan(f.first);
  plan.checks[0].inputs = ["source.txt"];
  assert.equal(
    await readFile(join(f.first, "node_modules/local/index.js"), "utf8"),
    "target package",
  );
  assert.equal((await runVerification(plan, f.options(lease))).success, true);
});

test("dangling host dependency symlink is rejected", async (t) => {
  const f = await fixture(t);
  await symlink("../packages/missing", join(f.host, "node_modules/dangling"));

  await assert.rejects(materializeVerificationDependencies(f.host, f.first), {
    code: "verification_dependencies_unsafe",
  });
});

test("external host dependency symlink is rejected", async (t) => {
  const f = await fixture(t);
  const outside = join(f.host, "..", "outside-package");
  await mkdir(outside, { recursive: true });
  t.after(() => rm(outside, { recursive: true, force: true }));
  await writeFile(join(outside, "index.js"), "external");
  await symlink(outside, join(f.host, "node_modules/external"));

  await assert.rejects(materializeVerificationDependencies(f.host, f.first), {
    code: "verification_dependencies_unsafe",
  });
});

test("dangling target package symlink is rejected instead of omitted", async (t) => {
  const f = await fixture(t);
  await mkdir(join(f.host, "packages/pkg"), { recursive: true });
  await writeFile(join(f.host, "packages/pkg/package.json"), '{"name":"pkg"}');
  await writeFile(join(f.host, "packages/pkg/index.js"), "host package");
  await symlink("../packages/pkg", join(f.host, "node_modules/local"));
  await mkdir(join(f.first, "packages"), { recursive: true });
  await symlink("missing-package", join(f.first, "packages/pkg"));

  await assert.rejects(materializeVerificationDependencies(f.host, f.first), {
    code: "verification_dependencies_unsafe",
  });
});

test("dangling target packages ancestor is rejected instead of omitted", async (t) => {
  const f = await fixture(t);
  await mkdir(join(f.host, "packages/pkg"), { recursive: true });
  await writeFile(join(f.host, "packages/pkg/package.json"), '{"name":"pkg"}');
  await symlink("../packages/pkg", join(f.host, "node_modules/local"));
  await symlink("missing-packages", join(f.first, "packages"));

  await assert.rejects(materializeVerificationDependencies(f.host, f.first), {
    code: "verification_dependencies_unsafe",
  });
});

test("workspace package without a regular package manifest is not omitted", async (t) => {
  const f = await fixture(t);
  await mkdir(join(f.host, "packages/pkg"), { recursive: true });
  await writeFile(join(f.host, "packages/pkg/index.js"), "host package");
  await symlink("../packages/pkg", join(f.host, "node_modules/local"));

  await assert.rejects(materializeVerificationDependencies(f.host, f.first), {
    code: "verification_dependencies_unsafe",
  });
});

test("workspace mode remains local even with matching dependency leases", async (t) => {
  const f = await fixture(t);
  const first = f.options(
    await materializeVerificationDependencies(f.host, f.first),
  );
  const second = f.options(
    await materializeVerificationDependencies(f.host, f.second),
  );
  first.portability = "workspace";
  second.portability = "workspace";
  assert.equal((await runVerification(f.plan(f.first), first)).success, true);
  assert.equal(
    (await runVerification(f.plan(f.second), second)).checks[0].executed,
    true,
  );
});

test("missing deployed source owner never becomes a stable missing-files digest", async (t) => {
  const f = await fixture(t);
  await assert.rejects(assertVerificationOwner(f.host), {
    code: "verification_owner_unavailable",
  });
});
