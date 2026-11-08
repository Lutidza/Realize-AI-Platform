/**
 * @file .ai/tools/engineering/test/aliasMove.test.ts
 * @version 1.0.0
 * @date 2026-10-29
 * @description Проверяет wildcard alias move, exact preview/receipt, read ACL, drift и recovery настоящих native effects.
 * @see documentation/architecture/engineering-operations.md
 */
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import type { TestContext } from "node:test";
import { sha256Bytes } from "@realize/engineering-runtime";
import type { LoadEngineeringNativeInput } from "@realize/engineering-runtime";
import { aliasMoveFixture } from "./aliasMove.fixture.ts";
import {
  applyCommand,
  getCommand,
  planCommand,
} from "./filesystemIntegration.fixture.ts";

let native: LoadEngineeringNativeInput, build: string;
before(() => {
  build = mkdtempSync(join(homedir(), ".cache", "engineering-alias-native-"));
  native = JSON.parse(
    execFileSync(
      process.execPath,
      ["scripts/buildEngineeringNative.mjs", "--output", build],
      { encoding: "utf8", timeout: 60_000 },
    ),
  );
});
after(() => {
  if (build) rmSync(build, { recursive: true, force: true });
});
function fixture(t: TestContext, inherited = false) {
  const f = aliasMoveFixture(native);
  if (inherited) {
    f.put(
      "config/base.json",
      JSON.stringify({
        compilerOptions: {
          moduleResolution: "bundler",
          baseUrl: "..",
          paths: { "@app/*": ["src/*"] },
        },
      }),
    );
    f.put("config/middle.json", '{"extends":"./base"}');
    f.put(
      "tsconfig.json",
      '\uFEFF{/* inherited */ "extends":"./config/middle",}',
    );
  }
  t.after(() => {
    f.close();
    rmSync(f.root, { recursive: true, force: true });
  });
  return f;
}

function configuration(
  f: ReturnType<typeof aliasMoveFixture>,
  inherited: boolean,
) {
  const paths = inherited
    ? ["tsconfig.json", "config/middle.json", "config/base.json"]
    : ["tsconfig.json"];
  return Object.fromEntries(
    paths.map((path) => [path, readFileSync(join(f.checkout, path))]),
  );
}

for (const inherited of [false, true])
  test(`preview ${inherited ? "inherited" : "direct"} не пишет; frozen move + metadata + alias consumer дают полный receipt и idempotent apply`, async (t) => {
    const f = fixture(t, inherited),
      config = configuration(f, inherited),
      original = readFileSync(join(f.checkout, f.from));
    const request = f.command(),
      plan = await f.runtime.plan(request);
    assert.equal(plan.state, "planned", JSON.stringify(plan));
    assert.equal((await f.runtime.plan(request)).operationId, plan.operationId);
    const preview = await f.runtime.preview({
      ...getCommand(plan),
      planId: plan.planRef!.planId,
      after: null,
      limit: 100,
    });
    assert.deepEqual(
      preview.effects.map((e) => e.kind),
      ["move", "edit_file", "edit_file"],
    );
    assert.match(
      preview.effects[2].diff!,
      /\+import .*@app\/pricing\/calculateTotal\.util/,
    );
    assert.equal(f.control.writes, 0);
    assert.deepEqual(readFileSync(join(f.checkout, f.from)), original);
    const apply = applyCommand(plan),
      done = await f.runtime.apply(apply);
    assert.equal(done.state, "completed", JSON.stringify(done));
    assert.equal((await f.runtime.apply(apply)).operationId, done.operationId);
    assert.equal(f.control.writes, 3);
    assert.equal(existsSync(join(f.checkout, f.from)), false);
    assert.deepEqual(configuration(f, inherited), config);
    assert.match(
      readFileSync(join(f.checkout, f.to), "utf8"),
      /@file src\/pricing\/calculateTotal\.util\.ts/,
    );
    assert.match(
      readFileSync(join(f.checkout, f.to), "utf8"),
      /export function calculateTotal\(/,
    );
    assert.match(
      readFileSync(join(f.checkout, f.consumer), "utf8"),
      /@app\/pricing\/calculateTotal\.util/,
    );
    const receipt = await f.runtime.receipt(getCommand(done));
    assert.equal(receipt?.changedArtifacts?.length, 2);
    for (const item of receipt!.changedArtifacts!)
      assert.equal(
        item.sha256,
        sha256Bytes(readFileSync(join(f.checkout, item.path))),
      );
  });

for (const inherited of [false, true])
  test(`directory alias move ${inherited ? "inherited" : "direct"} сохраняет negative probes вне списка физических tree objects`, async (t) => {
    const f = fixture(t, inherited),
      config = configuration(f, inherited),
      destination = "src/pricing/moved";
    const plan = await f.runtime.plan(
      planCommand([
        {
          kind: "move",
          from: "src/math",
          to: destination,
          expectedVersion: f.ports.directoryVersion("src/math"),
        },
      ]),
    );
    assert.equal(plan.state, "planned", JSON.stringify(plan));
    const done = await f.runtime.apply(applyCommand(plan));
    assert.equal(done.state, "completed", JSON.stringify(done));
    assert.equal(f.control.writes, 3);
    assert.deepEqual(configuration(f, inherited), config);
    assert.match(
      readFileSync(join(f.checkout, f.consumer), "utf8"),
      /@app\/pricing\/moved\/calculateTotal\.util/,
    );
    const receipt = await f.runtime.receipt(getCommand(done));
    assert.equal(receipt?.changedArtifacts?.length, 3);
    assert.equal(
      receipt!.changedArtifacts!.filter((item) => item.sha256 === null).length,
      1,
    );
  });

for (const extension of ["", ".js", ".ts"])
  test(`alias сохраняет стиль ${extension || "extensionless"}, re-export/type/dynamic references и CRLF`, async (t) => {
    const f = fixture(t);
    f.utility(
      f.consumer,
      `export { calculateTotal } from '@app/math/calculateTotal.util${extension}';\nexport type { calculateTotal as Total } from '@app/math/calculateTotal.util${extension}';\nexport function useTotal() { return import('@app/math/calculateTotal.util${extension}'); }`,
    );
    f.put(
      f.consumer,
      "\uFEFF" +
        readFileSync(join(f.checkout, f.consumer), "utf8").replaceAll(
          "\n",
          "\r\n",
        ),
    );
    const plan = await f.runtime.plan(f.command());
    assert.equal(plan.state, "planned", JSON.stringify(plan));
    assert.equal(
      (await f.runtime.apply(applyCommand(plan))).state,
      "completed",
    );
    const output = readFileSync(join(f.checkout, f.consumer), "utf8");
    assert.equal(
      output.split(`@app/pricing/calculateTotal.util${extension}`).length - 1,
      3,
    );
    assert.equal(output.charCodeAt(0), 0xfeff);
    assert.equal(output.replaceAll("\r\n", "").includes("\n"), false);
  });

test("wildcard target с фиксированным .ts suffix сохраняет alias без расширения", async (t) => {
  const f = fixture(t);
  f.configure({ "@app/*": ["src/*.ts"] });
  const plan = await f.runtime.plan(f.command());
  assert.equal(plan.state, "planned", JSON.stringify(plan));
  assert.equal((await f.runtime.apply(applyCommand(plan))).state, "completed");
  assert.match(
    readFileSync(join(f.checkout, f.consumer), "utf8"),
    /"@app\/pricing\/calculateTotal\.util"/,
  );
});

for (const [name, setup] of [
  [
    "неоднозначный inverse",
    (f) => f.configure({ "@app/*": ["src/*"], "@second/*": ["src/*"] }),
  ],
  [
    "exact alias",
    (f) => f.configure({ "@app/math/calculateTotal.util": [f.from] }),
  ],
  [
    "multiple bases",
    (f) => {
      f.put("base.json", readFileSync(join(f.checkout, "tsconfig.json")));
      f.put("other.json", "{}");
      f.configure(undefined, { extends: ["./base.json", "./other.json"] });
    },
  ],
  ["missing base", (f) => f.configure(undefined, { extends: "./missing" })],
  ["cycle", (f) => f.configure(undefined, { extends: "./tsconfig" })],
  [
    "package extends",
    (f) => f.configure(undefined, { extends: "@tsconfig/node24" }),
  ],
  ["цель вне roots", (f) => f.configure({ "@app/*": ["outside/*"] })],
  ["неизвестный source profile", (f) => f.put("src/other.ts", "export {};")],
  [
    "collision",
    (f) => f.utility(f.to, "export function calculateTotal() { return 0; }"),
  ],
] satisfies [string, (f: ReturnType<typeof aliasMoveFixture>) => void][])
  test(`план не скрывает ограничение: ${name}`, async (t) => {
    const f = fixture(t);
    setup(f);
    const plan = await f.runtime.plan(f.command());
    assert.equal(plan.state, "failed", JSON.stringify(plan));
    assert.equal(f.control.writes, 0);
    assert.ok(existsSync(join(f.checkout, f.from)));
  });

for (const inherited of [false, true])
  for (const read of [false, true])
    test(`ACL ${inherited ? "inherited" : "direct"} ${read ? "config read" : "consumer edit"} проверяется до плана и после preview`, async (t) => {
      const f = fixture(t, inherited),
        key = read ? "deniedReadPaths" : "deniedPaths",
        path = read
          ? inherited
            ? "config/base.json"
            : "tsconfig.json"
          : f.consumer;
      f.control[key] = [path];
      const denied = await f.runtime.plan(f.command());
      assert.equal(denied.state, "failed", JSON.stringify(denied));
      assert.equal(denied.error?.code, "FORBIDDEN");
      f.control[key] = [];
      const plan = await f.runtime.plan(f.command());
      assert.equal(plan.state, "planned", JSON.stringify(plan));
      f.control[key] = [path];
      try {
        const applied = await f.runtime.apply(applyCommand(plan));
        assert.equal(applied.error?.code, "FORBIDDEN", JSON.stringify(applied));
      } catch (error) {
        assert.equal((error as { code: string }).code, "FORBIDDEN");
      }
      assert.equal(f.control.writes, 0);
    });

for (const [name, change, inherited = false] of [
  ["config bytes", (f) => f.configure({ "@app/*": ["elsewhere/*"] })],
  ["nearer config", (f) => f.put("src/tsconfig.json", "{}")],
  [
    "nearer config directory",
    (f) => f.put("src/tsconfig.json/marker", "changed"),
  ],
  [
    "новый кандидат",
    (f) => f.put("src/math/calculateTotal.util.js", "export {};"),
  ],
  [
    "consumer bytes",
    (f) =>
      f.put(
        f.consumer,
        readFileSync(join(f.checkout, f.consumer), "utf8") + "\n// drift\n",
      ),
  ],
  ["inherited base bytes", (f) => f.put("config/base.json", "{}"), true],
  [
    "inherited edge",
    (f) => f.put("config/middle.json", '{"extends":"./other"}'),
    true,
  ],
  [
    "inherited base removed",
    (f) => rmSync(join(f.checkout, "config/base.json")),
    true,
  ],
] satisfies [
  string,
  (f: ReturnType<typeof aliasMoveFixture>) => void,
  boolean?,
][])
  test(`изменение ${name} после preview отклоняет frozen plan`, async (t) => {
    const f = fixture(t, inherited),
      plan = await f.runtime.plan(f.command());
    assert.equal(plan.state, "planned", JSON.stringify(plan));
    change(f);
    await assert.rejects(f.runtime.apply(applyCommand(plan)), {
      code: "CONFLICT",
    });
    assert.equal(f.control.writes, 0);
  });

test("перенос consumer использует effective config назначения и проверяет обе цели", async (t) => {
  const f = fixture(t),
    next = "src/pricing/useTotal.util.ts";
  // Config внутри source inventory не разрешает превращать его в поддержанный artifact.
  f.put(
    "src/pricing/tsconfig.json",
    '{"compilerOptions":{"baseUrl":".","paths":{"@app/*":["different/*"]}}}',
  );
  const plan = await f.runtime.plan(f.command(f.consumer, next));
  assert.equal(plan.state, "failed", JSON.stringify(plan));
  assert.equal(f.control.writes, 0);
});

for (const inherited of [false, true])
  test(`отзыв ${inherited ? "inherited" : "direct"} config read после первого эффекта блокирует continuation до восстановления допуска`, async (t) => {
    const f = fixture(t, inherited),
      plan = await f.runtime.plan(f.command());
    assert.equal(plan.state, "planned", JSON.stringify(plan));
    f.control.afterWrite = () => {
      f.control.deniedReadPaths = [
        inherited ? "config/base.json" : "tsconfig.json",
      ];
    };
    const partial = await f.runtime.apply(applyCommand(plan));
    assert.equal(partial.state, "recovery_required", JSON.stringify(partial));
    assert.equal(partial.error?.code, "FORBIDDEN");
    assert.equal(f.control.writes, 1);
    await assert.rejects(f.runtime.inspectRecovery(getCommand(partial)), {
      code: "FORBIDDEN",
    });
    f.control.afterWrite = undefined;
    f.control.deniedReadPaths = [];
    const recovery = await f.runtime.inspectRecovery(getCommand(partial));
    const done = await f.runtime.recover({
      ...getCommand(partial),
      recoveryPlanId: recovery.recoveryPlanId,
      recoveryPlanHash: recovery.recoveryPlanHash,
      expectedRevision: recovery.revision,
      requestId: randomUUID(),
      action: "resume",
    });
    assert.equal(done.state, "completed", JSON.stringify(done));
    assert.equal(f.control.writes, 3);
  });

for (const inherited of [false, true])
  for (const atWrite of [1, 2, 3])
    test(`SIGKILL после ${inherited ? "inherited" : "direct"} alias effect ${atWrite}: recovery завершает единственный frozen plan`, async (t) => {
      let f = fixture(t, inherited);
      const config = configuration(f, inherited);
      const plan = await f.runtime.plan(f.command());
      assert.equal(plan.state, "planned", JSON.stringify(plan));
      const root = f.root,
        input = join(root, "crash.json");
      writeFileSync(
        input,
        JSON.stringify({
          native,
          root,
          movePolicy: f.movePolicy,
          command: applyCommand(plan),
          atWrite,
        }),
      );
      f.close();
      const child = spawn(
        process.execPath,
        [
          "--import",
          "tsx",
          ".ai/tools/engineering/test/filesystemCrash.worker.ts",
          input,
        ],
        { stdio: ["ignore", "ignore", "pipe"] },
      );
      let stderr = "";
      child.stderr.on("data", (value) => {
        stderr += value;
      });
      const [code, signal] = await once(child, "exit");
      assert.equal(code, null, stderr);
      assert.equal(signal, "SIGKILL", stderr);
      f = aliasMoveFixture(native, root);
      t.after(() => f.close());
      const recovery = await f.runtime.inspectRecovery(getCommand(plan));
      assert.deepEqual(recovery.actions, ["resume"]);
      const done = await f.runtime.recover({
        ...getCommand(plan),
        recoveryPlanId: recovery.recoveryPlanId,
        recoveryPlanHash: recovery.recoveryPlanHash,
        expectedRevision: recovery.revision,
        requestId: randomUUID(),
        action: "resume",
      });
      assert.equal(done.state, "completed", JSON.stringify(done));
      assert.equal(f.control.writes, 3 - atWrite);
      assert.deepEqual(configuration(f, inherited), config);
      const receipt = await f.runtime.receipt(getCommand(done));
      for (const item of receipt!.changedArtifacts!)
        assert.equal(
          item.sha256,
          sha256Bytes(readFileSync(join(f.checkout, item.path))),
        );
      assert.match(
        readFileSync(join(f.checkout, f.consumer), "utf8"),
        /@app\/pricing\/calculateTotal\.util/,
      );
    });
