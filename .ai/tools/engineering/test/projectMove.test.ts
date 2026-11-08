/**
 * @file .ai/tools/engineering/test/projectMove.test.ts
 * @version 1.0.1
 * @date 2026-10-29
 * @description Проверяет project move, complete inventory, полномочия и восстановление реальных native шагов.
 * @see documentation/architecture/engineering-operations.md
 */
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { after, before, test } from "node:test";
import type { TestContext } from "node:test";
import {
  createLocalFilesystemPorts,
  EngineeringRuntime,
  loadEngineeringNative,
  openEngineeringStore,
  sha256Bytes,
} from "@realize/engineering-runtime";
import type {
  LoadEngineeringNativeInput,
  OperationView,
} from "@realize/engineering-runtime";
import {
  createProjectArtifactBinding,
  renderAiTemplate,
  renderSourceTemplate,
} from "../src/projectEngineering.index.ts";
import type { ProjectMovePolicy } from "../src/projectEngineering.index.ts";
import {
  applyCommand,
  contentCommand,
  filesystemFixture,
  getCommand,
  planCommand,
  policySource,
  principal,
  targetId,
} from "./filesystemIntegration.fixture.ts";

let native: LoadEngineeringNativeInput, build: string;
before(() => {
  build = mkdtempSync(
    join(homedir(), ".cache", "engineering-project-move-native-"),
  );
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

const from = "src/move/left/calculateTotal.util.ts",
  to = "src/move/right/deep/calculateTotal.util.ts";
const consumer = "src/move/left/useTotal.util.ts";
const movePolicy: ProjectMovePolicy = {
  changedOn: "2026-10-28",
  coverage: "complete",
  referenceRoots: ["src/move"],
  sourcePaths: [policySource],
};
function utility(path: string, body: string) {
  return renderSourceTemplate({
    path,
    body,
    descriptionRu: "Вычисляет результат для проверки переноса.",
    createdOn: "2026-10-26",
    seeRefs: ["documentation/architecture/engineering-artifacts.md"],
  });
}
function put(
  f: ReturnType<typeof filesystemFixture>,
  path: string,
  content: Uint8Array | string,
) {
  mkdirSync(dirname(join(f.checkout, path)), { recursive: true });
  writeFileSync(join(f.checkout, path), content);
}
function fixture(t: TestContext, policy = movePolicy) {
  const f = filesystemFixture(native, undefined, undefined, [], policy);
  mkdirSync(join(f.checkout, dirname(to)), { recursive: true });
  put(
    f,
    "src/move/helper.util.ts",
    utility(
      "src/move/helper.util.ts",
      "export function helper() { return 4; }",
    ),
  );
  put(
    f,
    from,
    Buffer.from(
      "\uFEFF" +
        Buffer.from(
          utility(
            from,
            'import { helper } from "../helper.util.js";\nexport function calculateTotal() { return helper(); }',
          ),
        )
          .toString("utf8")
          .replaceAll("\n", "\r\n"),
    ),
  );
  put(
    f,
    consumer,
    utility(
      consumer,
      [
        'import { calculateTotal } from "./calculateTotal.util.js";',
        'export { calculateTotal as total } from "./calculateTotal.util";',
        'export type Sum = typeof import("./calculateTotal.util.ts").calculateTotal;',
        'export async function useTotal() { await import("./calculateTotal.util.js"); return calculateTotal(); }',
      ].join("\n"),
    ),
  );
  t.after(() => {
    f.close();
    rmSync(f.root, { recursive: true, force: true });
  });
  return f;
}
function move(
  f: ReturnType<typeof filesystemFixture>,
  source = from,
  destination = to,
) {
  return {
    kind: "move",
    from: source,
    to: destination,
    expectedVersion: sha256Bytes(readFileSync(join(f.checkout, source))),
  };
}
async function resume(
  f: ReturnType<typeof filesystemFixture>,
  view: OperationView,
) {
  const recovery = await f.runtime.inspectRecovery(getCommand(view));
  assert.deepEqual(recovery.actions, ["resume"]);
  return f.runtime.recover({
    ...getCommand(view),
    recoveryPlanId: recovery.recoveryPlanId,
    recoveryPlanHash: recovery.recoveryPlanHash,
    expectedRevision: recovery.revision,
    requestId: randomUUID(),
    action: "resume",
  });
}

test("source move freezes incoming/outgoing references, preserves BOM/CRLF/mode and emits final hashes once", async (t) => {
  const f = fixture(t);
  chmodSync(join(f.checkout, from), 0o640);
  const original = readFileSync(join(f.checkout, from)),
    inode = statSync(join(f.checkout, from)).ino;
  const consumerBefore = readFileSync(join(f.checkout, consumer), "utf8");
  const plan = await f.runtime.plan(planCommand([move(f)]));
  assert.equal(plan.state, "planned", JSON.stringify(plan));
  assert.deepEqual(readFileSync(join(f.checkout, from)), original);
  const preview = await f.runtime.preview({
    ...getCommand(plan),
    planId: plan.planRef!.planId,
    after: null,
    limit: 100,
  });
  assert.deepEqual(
    preview.effects.map((effect) => effect.kind),
    ["move", "edit_file", "edit_file"],
  );
  assert.match(preview.effects[1].diff!, /\.\.\/\.\.\/helper\.util\.js/);
  assert.match(
    preview.effects[2].diff!,
    /\.\.\/right\/deep\/calculateTotal\.util\.ts/,
  );
  const command = applyCommand(plan),
    done = await f.runtime.apply(command);
  assert.equal(done.state, "completed", JSON.stringify(done));
  assert.equal(existsSync(join(f.checkout, from)), false);
  const expected = original
    .toString("utf8")
    .replace(from, to)
    .replace("@version 1.0.0", "@version 1.0.1")
    .replace("@date 2026-10-26", "@date 2026-10-28")
    .replace('"../helper.util.js"', '"../../helper.util.js"');
  assert.deepEqual(readFileSync(join(f.checkout, to)), Buffer.from(expected));
  assert.equal(statSync(join(f.checkout, to)).mode & 0o777, 0o640);
  assert.equal(
    readFileSync(join(f.checkout, consumer), "utf8"),
    consumerBefore
      .replaceAll("./calculateTotal.util", "../right/deep/calculateTotal.util")
      .replace("@version 1.0.0", "@version 1.0.1")
      .replace("@date 2026-10-26", "@date 2026-10-28"),
  );
  const stage = readdirSync(join(f.root, "files")).find(
    (name) => name !== "content",
  )!;
  assert.equal(statSync(join(f.root, "files", stage, "1")).ino, inode);
  assert.deepEqual(readFileSync(join(f.root, "files", stage, "1")), original);
  const receipt = await f.runtime.receipt(getCommand(done));
  assert.ok(receipt?.changedArtifacts);
  assert.deepEqual(
    receipt.changedArtifacts.map((item) => item.path),
    [to, consumer],
  );
  for (const item of receipt.changedArtifacts)
    assert.equal(
      item.sha256,
      sha256Bytes(readFileSync(join(f.checkout, item.path))),
    );
  assert.equal(f.control.writes, 3);
  assert.deepEqual(await f.runtime.apply(command), done);
  assert.equal(f.control.writes, 3);
});

test("template move updates IDs, rooted references, inline links and definitions while preserving code examples", async (t) => {
  const source = ".ai/templates/move/left/TEMPLATE-REVIEW.md",
    target = ".ai/templates/move/right/deep/TEMPLATE-FINAL.md",
    dependent = ".ai/templates/move/left/TEMPLATE-CONSUMER.md";
  const policy: ProjectMovePolicy = {
    ...movePolicy,
    referenceRoots: [".ai/templates/move"],
  };
  const f = filesystemFixture(native, undefined, undefined, [], policy);
  t.after(() => {
    f.close();
    rmSync(f.root, { recursive: true, force: true });
  });
  mkdirSync(join(f.checkout, dirname(target)), { recursive: true });
  const make = (path: string, relatedArtifacts: string[], body: string) =>
    renderAiTemplate({
      path,
      templateId: path.split("/").at(-1)!.slice(0, -3),
      titleRu: "Проверка переноса",
      purposeRu: "Проверяет связи шаблона.",
      usageRu: "Применяется в текущей проверке.",
      sections: [{ headingRu: "Ссылки", body }],
      relatedArtifacts,
    });
  put(
    f,
    source,
    make(source, [], "[База](../../markdown/TEMPLATE-AI-RUNTIME-MARKDOWN.md)"),
  );
  const examples =
    "`[Пример](TEMPLATE-REVIEW.md)`\n\n````md\n[Пример](TEMPLATE-REVIEW.md)\n````";
  put(
    f,
    dependent,
    make(
      dependent,
      [source],
      '[Ссылка](TEMPLATE-REVIEW.md#назначение)\n\n[Другая][review]\n\n[review]: <TEMPLATE-REVIEW.md#назначение> "Обзор"\n\n' +
        examples,
    ),
  );
  const plan = await f.runtime.plan(planCommand([move(f, source, target)]));
  assert.equal(plan.state, "planned", JSON.stringify(plan));
  const done = await f.runtime.apply(applyCommand(plan));
  assert.equal(done.state, "completed", JSON.stringify(done));
  const moved = readFileSync(join(f.checkout, target), "utf8"),
    edited = readFileSync(join(f.checkout, dependent), "utf8");
  assert.match(moved, /template_id: "TEMPLATE-FINAL"/);
  assert.match(moved, /owner_layer: "\.ai\/templates\/move\/right\/deep\/"/);
  assert.match(
    moved,
    /\.\.\/\.\.\/\.\.\/markdown\/TEMPLATE-AI-RUNTIME-MARKDOWN\.md/,
  );
  assert.ok(edited.includes(target));
  assert.ok(
    edited.includes("[Ссылка](../right/deep/TEMPLATE-FINAL.md#назначение)"),
  );
  assert.ok(
    edited.includes(
      '[review]: <../right/deep/TEMPLATE-FINAL.md#назначение> "Обзор"',
    ),
  );
  assert.ok(edited.includes(examples));
});

for (const [name, body] of [
  [
    "bare alias",
    'import x from "@/something"; export function useTotal() { return x; }',
  ],
  [
    "computed import",
    "export function useTotal(path: string) { return import(path); }",
  ],
  [
    "require",
    'export function useTotal() { return require("./calculateTotal.util"); }',
  ],
  [
    "ambiguous path string",
    'export function useTotal() { return "./calculateTotal.util.ts"; }',
  ],
  [
    "reference outside inventory",
    'import x from "../../../outside.util.ts"; export function useTotal() { return x; }',
  ],
] as const)
  test(`move rejects ${name} without live writes`, async (t) => {
    const f = fixture(t);
    put(f, consumer, utility(consumer, body));
    const plan = await f.runtime.plan(planCommand([move(f)]));
    assert.equal(plan.state, "failed", JSON.stringify(plan));
    assert.equal(plan.error?.code, "UNSUPPORTED");
    assert.equal(f.control.writes, 0);
    assert.ok(existsSync(join(f.checkout, from)));
  });

for (const addition of ["unknown", "symlink"] as const)
  test(`complete inventory rejects ${addition} instead of skipping it`, async (t) => {
    const f = fixture(t);
    if (addition === "unknown") put(f, "src/move/unknown.json", "{}");
    else symlinkSync("left", join(f.checkout, "src/move/linked"));
    const plan = await f.runtime.plan(planCommand([move(f)]));
    assert.equal(plan.state, "failed", JSON.stringify(plan));
    assert.equal(plan.error?.code, "UNSUPPORTED");
    assert.equal(f.control.writes, 0);
  });

for (const addition of ["file", "empty directory", "bytes"] as const)
  test(`inventory detects ${addition} changes after plan`, async (t) => {
    const f = fixture(t),
      plan = await f.runtime.plan(planCommand([move(f)]));
    assert.equal(plan.state, "planned", JSON.stringify(plan));
    if (addition === "file")
      put(
        f,
        "src/move/extra.util.ts",
        utility(
          "src/move/extra.util.ts",
          "export function extra() { return 0; }",
        ),
      );
    else if (addition === "empty directory")
      mkdirSync(join(f.checkout, "src/move/empty"));
    else
      writeFileSync(
        join(f.checkout, "src/move/helper.util.ts"),
        utility(
          "src/move/helper.util.ts",
          "export function helper() { return 5; }",
        ),
      );
    await assert.rejects(f.runtime.apply(applyCommand(plan)));
    assert.equal(f.control.writes, 0);
  });

for (const path of [
  ".ai/tools/agent-search/src/getModuleFileCandidates.util.mjs",
  ".ai/tools/agent-search/src/readSyntaxModuleReference.util.mjs",
  ".ai/tools/agent-search/src/parseSyntaxSource.util.mjs",
  ".ai/tools/quality/readMarkdownLinks.util.ts",
  ".ai/tools/quality/maskMarkdownCode.util.ts",
])
  test(`изменение общей зависимости блокирует прежний move plan: ${path}`, async (t) => {
    const f = fixture(t);
    const plan = await f.runtime.plan(planCommand([move(f)]));
    assert.equal(plan.state, "planned", JSON.stringify(plan));
    put(
      f,
      path,
      readFileSync(join(f.checkout, path), "utf8") +
        "\n// Изменённая зависимость.\n",
    );
    await assert.rejects(f.runtime.apply(applyCommand(plan)), {
      code: "CONFLICT",
      phase: "admission",
    });
    assert.equal(f.control.writes, 0);
    assert.ok(existsSync(join(f.checkout, from)));
  });

test("expanded consumer authorization is checked before plan and before the first rename", async (t) => {
  const f = fixture(t);
  f.control.deniedPaths = [consumer];
  const rejected = await f.runtime.plan(planCommand([move(f)]));
  assert.equal(rejected.state, "failed");
  assert.equal(rejected.error?.code, "FORBIDDEN");
  assert.equal(rejected.planRef, null);
  f.control.deniedPaths = [];
  const plan = await f.runtime.plan(planCommand([move(f)]));
  assert.equal(plan.state, "planned", JSON.stringify(plan));
  f.control.deniedPaths = [consumer];
  const denied = await f.runtime.apply(applyCommand(plan));
  assert.equal(denied.error?.code, "FORBIDDEN");
  assert.equal(denied.effectsSummary, "none");
  assert.equal(f.control.writes, 0);
  assert.ok(existsSync(join(f.checkout, from)));
});

test("revocation during execution preserves partial state and recovery rechecks remaining consumers", async (t) => {
  const f = fixture(t),
    plan = await f.runtime.plan(planCommand([move(f)]));
  assert.equal(plan.state, "planned", JSON.stringify(plan));
  f.control.afterWrite = () => {
    f.control.deniedPaths = [consumer];
  };
  const partial = await f.runtime.apply(applyCommand(plan));
  assert.equal(partial.state, "recovery_required");
  assert.equal(f.control.writes, 2);
  assert.equal((await resume(f, partial)).state, "recovery_required");
  assert.equal(f.control.writes, 2);
  f.control.afterWrite = undefined;
  f.control.deniedPaths = [];
  const done = await resume(f, partial);
  assert.equal(done.state, "completed", JSON.stringify(done));
  assert.equal(f.control.writes, 3);
});

test("explicit actions cannot overlap dependent edits or introduce a second project move", async (t) => {
  const f = fixture(t);
  for (const actions of [
    [
      move(f),
      {
        kind: "remove",
        path: consumer,
        expectedVersion: sha256Bytes(readFileSync(join(f.checkout, consumer))),
      },
    ],
    [move(f), move(f, consumer, "src/move/right/deep/useTotal.util.ts")],
  ]) {
    const plan = await f.runtime.plan(planCommand(actions));
    assert.equal(plan.state, "failed", JSON.stringify(plan));
    assert.equal(f.control.writes, 0);
  }
});

test("a sibling explicit action cannot introduce a consumer outside the frozen inventory", async (t) => {
  const f = fixture(t);
  const path = "src/move/newConsumer.util.ts";
  const content = await f.runtime.prepareContent(
    contentCommand(
      utility(
        path,
        'import { calculateTotal } from "./left/calculateTotal.util.js"; export function newConsumer() { return calculateTotal(); }',
      ),
    ),
  );
  const plan = await f.runtime.plan(
    planCommand([
      move(f),
      {
        kind: "create_file",
        path,
        artifactKind: "source.util",
        contentRef: content.contentRef,
      },
    ]),
  );
  assert.equal(plan.state, "failed", JSON.stringify(plan));
  assert.equal(plan.error?.code, "UNSUPPORTED");
  assert.equal(f.control.writes, 0);
});

test("move cannot change the source symbol, overwrite a destination or leave its declared roots", async (t) => {
  const f = fixture(t);
  for (const destination of [
    "src/move/right/deep/renamed.util.ts",
    "src/outside/calculateTotal.util.ts",
    consumer,
  ]) {
    const plan = await f.runtime.plan(
      planCommand([move(f, from, destination)]),
    );
    assert.equal(plan.state, "failed", JSON.stringify(plan));
    assert.equal(f.control.writes, 0);
  }
});

test("missing native exchange cannot publish a project rename before discovering unsupported metadata edit", async (t) => {
  const f = fixture(t);
  f.close();
  const original = loadEngineeringNative(native);
  const store = openEngineeringStore({
    stateDirectory: join(f.root, "journal"),
    checkoutRoot: f.checkout,
    targetId,
    workspaceId: "a626cd72-08a4-4dd6-a1f2-2d87a42b1162",
    installationId: "4aa8e18c-8a21-40fb-8ce0-1e54fde7eb84",
  });
  const ports = createLocalFilesystemPorts({
    store,
    principal,
    filesDirectory: join(f.root, "files"),
    native: {
      inspectFd: original.inspectFd,
      renameNoReplace: original.renameNoReplace,
    },
    descriptors: (readReference) =>
      createProjectArtifactBinding({
        readReference,
        movePolicy,
        folderPolicies: [
          {
            id: "source",
            version: "1",
            root: "src",
            ownerRef: "fixture",
            purpose: "Исходники",
            boundary: "owner",
            allowedKinds: ["source.util"],
            allowedProvenance: ["authored"],
            sourcePaths: [policySource],
          },
        ],
      }),
  });
  try {
    const runtime = new EngineeringRuntime({
      ...f.options,
      store,
      planner: ports.planner,
      effects: ports.effects,
      content: ports.content,
    });
    const plan = await runtime.plan(planCommand([move(f)]));
    assert.equal(plan.state, "failed", JSON.stringify(plan));
    assert.equal(plan.error?.code, "UNSUPPORTED");
    assert.ok(existsSync(join(f.checkout, from)));
    assert.equal(existsSync(join(f.checkout, to)), false);
  } finally {
    ports.close();
    store.close();
  }
});

test("template ID collision is rejected across the complete inventory", async (t) => {
  const source = ".ai/templates/move/left/TEMPLATE-REVIEW.md",
    target = ".ai/templates/move/right/TEMPLATE-FINAL.md";
  const f = filesystemFixture(native, undefined, undefined, [], {
    ...movePolicy,
    referenceRoots: [".ai/templates/move"],
  });
  t.after(() => {
    f.close();
    rmSync(f.root, { recursive: true, force: true });
  });
  mkdirSync(join(f.checkout, dirname(target)), { recursive: true });
  for (const path of [source, ".ai/templates/move/left/TEMPLATE-FINAL.md"])
    put(
      f,
      path,
      renderAiTemplate({
        path,
        templateId: path.split("/").at(-1)!.slice(0, -3),
        titleRu: "Проверка",
        purposeRu: "Проверяет ID.",
        usageRu: "Проверяет конфликт.",
        sections: [
          {
            headingRu: "Проверка",
            body: "Подтверди уникальность идентификатора.",
          },
        ],
        relatedArtifacts: [],
      }),
    );
  const plan = await f.runtime.plan(planCommand([move(f, source, target)]));
  assert.equal(plan.state, "failed", JSON.stringify(plan));
  assert.equal(plan.error?.code, "CONFLICT");
  assert.equal(f.control.writes, 0);
});

test("a visible parent creation can precede project move in the same frozen plan", async (t) => {
  const f = fixture(t),
    directory = "src/move/created",
    destination = directory + "/calculateTotal.util.ts";
  const plan = await f.runtime.plan(
    planCommand([
      {
        kind: "create_directory",
        path: directory,
        purpose: "Назначение переноса",
        folderPolicyId: "source",
      },
      move(f, from, destination),
    ]),
  );
  assert.equal(plan.state, "planned", JSON.stringify(plan));
  const done = await f.runtime.apply(applyCommand(plan));
  assert.equal(done.state, "completed", JSON.stringify(done));
  assert.match(
    readFileSync(join(f.checkout, consumer), "utf8"),
    /\.\.\/created\/calculateTotal\.util\.js/,
  );
  assert.equal(f.control.writes, 4);
});

test("expanded effects cannot exceed the journal budget", async (t) => {
  const f = fixture(t);
  for (let index = 0; index < 62; index++) {
    const name = `dependent${index}`,
      path = `src/move/${name}.util.ts`;
    put(
      f,
      path,
      utility(
        path,
        `import { calculateTotal } from "./left/calculateTotal.util.js"; export function ${name}() { return calculateTotal(); }`,
      ),
    );
  }
  const plan = await f.runtime.plan(planCommand([move(f)]));
  assert.equal(plan.state, "failed", JSON.stringify(plan));
  assert.equal(plan.error?.code, "LIMIT_EXCEEDED");
  assert.match(plan.error!.message, /64 effects/);
  assert.equal(f.control.writes, 0);
});

for (const atWrite of [1, 2, 3])
  for (const phase of ["before", "after"])
    test(`SIGKILL ${phase} project move step ${atWrite} resumes the exact frozen cursor`, async (t) => {
      let f = fixture(t);
      const plan = await f.runtime.plan(planCommand([move(f)]));
      assert.equal(plan.state, "planned", JSON.stringify(plan));
      const root = f.root,
        inputPath = join(root, "crash.json");
      writeFileSync(
        inputPath,
        JSON.stringify({
          native,
          root,
          movePolicy,
          command: applyCommand(plan),
          phase,
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
          inputPath,
        ],
        { stdio: ["ignore", "pipe", "pipe"] },
      );
      let diagnostics = "";
      child.stderr.on("data", (chunk) => {
        diagnostics += chunk;
      });
      const [code, signal] = await once(child, "exit");
      assert.equal(code, null, diagnostics);
      assert.equal(signal, "SIGKILL", diagnostics);
      f = filesystemFixture(native, root, undefined, [], movePolicy);
      t.after(() => f.close());
      const afterCrash = await f.runtime.get(getCommand(plan));
      const done = await resume(f, afterCrash);
      assert.equal(done.state, "completed", JSON.stringify(done));
      assert.equal(
        f.control.writes,
        3 - atWrite + (phase === "before" ? 1 : 0),
      );
      const receipt = await f.runtime.receipt(getCommand(done));
      assert.ok(receipt?.changedArtifacts);
      assert.equal(receipt.changedArtifacts.length, 2);
      for (const item of receipt.changedArtifacts)
        assert.equal(
          item.sha256,
          sha256Bytes(readFileSync(join(f.checkout, item.path))),
        );
    });
