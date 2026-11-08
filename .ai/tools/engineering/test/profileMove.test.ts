/**
 * @file .ai/tools/engineering/test/profileMove.test.ts
 * @version 1.0.0
 * @date 2026-10-29
 * @description Проверяет native move mixed source profiles, TS/JSX consumers, права, границы и SIGKILL recovery.
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
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { after, before, test } from "node:test";
import type { TestContext } from "node:test";
import { sha256Bytes } from "@realize/engineering-runtime";
import type { LoadEngineeringNativeInput } from "@realize/engineering-runtime";
import type { ProjectFolderPolicy } from "../src/ProjectArtifactBinding.types.ts";
import { profileMoveFixture } from "./profileMove.fixture.ts";
import {
  applyCommand,
  getCommand,
  planCommand,
  policySource,
} from "./filesystemIntegration.fixture.ts";

let native: LoadEngineeringNativeInput, build: string;
before(() => {
  build = mkdtempSync(
    join(homedir(), ".cache", "engineering-profiles-native-"),
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
function fixture(
  t: TestContext,
  policies: readonly ProjectFolderPolicy[] = [],
) {
  const f = profileMoveFixture(native, undefined, policies);
  t.after(() => {
    f.close();
    rmSync(f.root, { recursive: true, force: true });
  });
  return f;
}

for (const name of [
  "resolvePrice.service.ts",
  "Price.adapter.ts",
  "ProductCard.component.tsx",
  "ProductCard.types.ts",
])
  test(`move ${name}: preview, exact receipt и повтор apply`, async (t) => {
    const f = fixture(t),
      from = `src/feature/${name}`,
      to = `src/moved/${name}`;
    const original = readFileSync(join(f.checkout, from)),
      config = readFileSync(join(f.checkout, "tsconfig.json"));
    const p = await f.runtime.plan(f.command(from));
    assert.equal(p.state, "planned", JSON.stringify(p));
    const preview = await f.runtime.preview({
      ...getCommand(p),
      planId: p.planRef!.planId,
      after: null,
      limit: 100,
    });
    assert.equal(f.control.writes, 0);
    assert.deepEqual(readFileSync(join(f.checkout, from)), original);
    assert.ok(preview.effects.length >= 3);
    const apply = applyCommand(p),
      done = await f.runtime.apply(apply);
    assert.equal(done.state, "completed", JSON.stringify(done));
    assert.equal(existsSync(join(f.checkout, from)), false);
    assert.deepEqual(readFileSync(join(f.checkout, "tsconfig.json")), config);
    const receipt = await f.runtime.receipt(getCommand(done));
    for (const item of receipt!.changedArtifacts!)
      assert.equal(
        item.sha256,
        sha256Bytes(readFileSync(join(f.checkout, item.path))),
      );
    const writes = f.control.writes;
    assert.equal((await f.runtime.apply(apply)).operationId, done.operationId);
    assert.equal(f.control.writes, writes);
    if (name.endsWith("tsx")) {
      assert.match(
        readFileSync(join(f.checkout, to), "utf8"),
        /"use client";\nimport type .*"\.\.\/feature\/ProductCard\.types"/,
      );
      assert.match(
        readFileSync(join(f.checkout, "src/PreviewCard.component.tsx"), "utf8"),
        /@app\/moved\/ProductCard\.component/,
      );
    }
    if (name.endsWith("service.ts")) {
      assert.match(
        readFileSync(join(f.checkout, to), "utf8"),
        /\.\.\/feature\/Price\.adapter\.js/,
      );
      assert.match(
        readFileSync(join(f.checkout, "src/usePrice.service.ts"), "utf8"),
        /@app\/moved\/resolvePrice\.service/,
      );
    }
  });

test("mixed directory move сохраняет directive/BOM/CRLF, types и реальные TypeScript consumers", async (t) => {
  const f = fixture(t),
    path = "src/feature/ProductCard.component.tsx";
  f.source(
    "src/feature/loadOffer.service.js",
    "export function loadOffer() { return 7; }",
  );
  f.source(
    "src/feature/Offer.component.jsx",
    "export function Offer() { return <span>Offer</span>; }",
  );
  f.put(
    path,
    "\uFEFF" +
      readFileSync(join(f.checkout, path), "utf8").replaceAll("\n", "\r\n"),
  );
  const plan = await f.runtime.plan(
    planCommand([
      {
        kind: "move",
        from: "src/feature",
        to: "src/moved/feature",
        expectedVersion: f.ports.directoryVersion("src/feature"),
      },
    ]),
  );
  assert.equal(plan.state, "planned", JSON.stringify(plan));
  assert.equal(f.control.writes, 0);
  const done = await f.runtime.apply(applyCommand(plan));
  assert.equal(done.state, "completed", JSON.stringify(done));
  const content = readFileSync(
    join(f.checkout, "src/moved/feature/ProductCard.component.tsx"),
    "utf8",
  );
  assert.equal(content.charCodeAt(0), 0xfeff);
  assert.equal(content.replaceAll("\r\n", "").includes("\n"), false);
  assert.match(content, /"use client";\r\n/);
  const receipt = await f.runtime.receipt(getCommand(done));
  assert.equal(receipt!.changedArtifacts!.length, 9);
  for (const item of receipt!.changedArtifacts!)
    if (item.sha256 !== null)
      assert.equal(
        item.sha256,
        sha256Bytes(readFileSync(join(f.checkout, item.path))),
      );
  // Compiler использует настоящий React JSX runtime только в удаляемом fixture; project resolver не читает node_modules.
  symlinkSync(resolve("node_modules"), join(f.checkout, "node_modules"), "dir");
  execFileSync(
    process.execPath,
    [
      resolve("node_modules/typescript/bin/tsc"),
      "--project",
      join(f.checkout, "tsconfig.json"),
      "--noEmit",
      "--allowJs",
      "--checkJs",
      "--strict",
      "--target",
      "ES2018",
      "--module",
      "ESNext",
      "--jsx",
      "react-jsx",
      "--skipLibCheck",
      "--ignoreDeprecations",
      "6.0",
    ],
    { encoding: "utf8", timeout: 60_000 },
  );
});

for (const [extension, style] of [
  ["js", ""],
  ["js", ".js"],
  ["jsx", ""],
  ["jsx", ".jsx"],
  ["tsx", ".js"],
  ["tsx", ".jsx"],
])
  test(`новый profile .${extension} сохраняет relative и alias style ${style || "extensionless"}`, async (t) => {
    const f = fixture(t),
      component = extension !== "js",
      name = component ? "Offer.component" : "loadOffer.service";
    const from = `src/feature/${name}.${extension}`;
    f.source(
      from,
      component
        ? "export function Offer() { return <span>Offer</span>; }"
        : "export function loadOffer() { return 7; }",
    );
    const consumer = component
      ? "src/OfferPreview.component.tsx"
      : "src/useOffer.service.ts";
    f.source(
      consumer,
      component
        ? `import { Offer } from "@app/feature/${name}${style}";\nexport { Offer } from "./feature/${name}${style}";\nexport function OfferPreview() { return <Offer/>; }`
        : `import { loadOffer } from "@app/feature/${name}${style}";\nexport function useOffer() { return loadOffer(); }\nexport { loadOffer } from "./feature/${name}${style}";`,
    );
    const p = await f.runtime.plan(f.command(from));
    assert.equal(p.state, "planned", JSON.stringify(p));
    assert.equal((await f.runtime.apply(applyCommand(p))).state, "completed");
    const text = readFileSync(join(f.checkout, consumer), "utf8");
    assert.ok(text.includes(`@app/moved/${name}${style}`));
    assert.ok(text.includes(`./moved/${name}${style}`));
  });

for (const boundary of ["client", "server"] as const)
  test(`move не меняет physical ${boundary} boundary при том же owner`, async (t) => {
    const from = "src/feature/resolvePrice.service.ts";
    const f = fixture(t, [
      {
        id: "file-boundary",
        version: "1",
        root: from,
        ownerRef: "fixture",
        purpose: "Execution",
        boundary,
        sourcePaths: [policySource],
      },
    ]);
    const plan = await f.runtime.plan(f.command(from));
    assert.equal(plan.state, "failed", JSON.stringify(plan));
    assert.equal(plan.error?.code, "UNSUPPORTED");
    assert.equal(f.control.writes, 0);
  });

test("client boundary переносится между двумя разрешёнными областями одного owner", async (t) => {
  const policies: ProjectFolderPolicy[] = ["src/feature", "src/moved"].map(
    (root, index) => ({
      id: `client-${index}`,
      version: "1",
      root,
      ownerRef: "fixture",
      purpose: "Client feature",
      boundary: "client",
      sourcePaths: [policySource],
    }),
  );
  const f = fixture(t, policies),
    p = await f.runtime.plan(
      f.command("src/feature/ProductCard.component.tsx"),
    );
  assert.equal(p.state, "planned", JSON.stringify(p));
  assert.equal((await f.runtime.apply(applyCommand(p))).state, "completed");
});

test("новый source profile не пересекает owner boundary", async (t) => {
  const f = fixture(t, [
    {
      id: "foreign",
      version: "1",
      root: "src/moved",
      ownerRef: "foreign",
      purpose: "Другой владелец",
      boundary: "owner",
      sourcePaths: [policySource],
    },
  ]);
  const p = await f.runtime.plan(
    f.command("src/feature/ProductCard.component.tsx"),
  );
  assert.equal(p.state, "failed", JSON.stringify(p));
  assert.equal(f.control.writes, 0);
});

for (const [name, change] of [
  [
    "consumer edit ACL",
    (f) => {
      f.control.deniedPaths = ["src/PreviewCard.component.tsx"];
    },
  ],
  [
    "profile source read ACL",
    (f) => {
      f.control.deniedReadPaths = [
        ".ai/tools/engineering/src/resolveProjectArtifactKind.util.ts",
      ];
    },
  ],
  ["config drift", (f) => f.put("tsconfig.json", "{}")],
  [
    "source drift",
    (f) => f.put("src/feature/ProductCard.component.tsx", "changed"),
  ],
  ["binding drift", (f) => f.put(policySource, "changed")],
] satisfies [string, (f: ReturnType<typeof profileMoveFixture>) => void][])
  test(`${name} после preview останавливает запись`, async (t) => {
    const f = fixture(t),
      p = await f.runtime.plan(
        f.command("src/feature/ProductCard.component.tsx"),
      );
    assert.equal(p.state, "planned", JSON.stringify(p));
    change(f);
    try {
      const result = await f.runtime.apply(applyCommand(p));
      assert.notEqual(result.state, "completed");
      assert.ok(
        ["FORBIDDEN", "CONFLICT"].includes(result.error?.code ?? ""),
        JSON.stringify(result),
      );
    } catch (error) {
      assert.ok(
        ["FORBIDDEN", "CONFLICT"].includes((error as { code: string }).code),
      );
    }
    assert.equal(f.control.writes, 0);
  });

test("unknown/native profile и collision не допускают неполный move", async (t) => {
  const f = fixture(t),
    from = "src/feature/ProductCard.component.tsx";
  f.put("src/page.tsx", "export default function Page(){return null;}");
  assert.equal((await f.runtime.plan(f.command(from))).state, "failed");
  rmSync(join(f.checkout, "src/page.tsx"));
  f.put(
    "src/moved/ProductCard.component.tsx",
    readFileSync(join(f.checkout, from)),
  );
  assert.equal((await f.runtime.plan(f.command(from))).state, "failed");
  assert.equal(f.control.writes, 0);
});

for (const name of ["resolvePrice.service.ts", "ProductCard.component.tsx"])
  for (const atWrite of [1, 2, 3])
    test(`SIGKILL ${name} effect ${atWrite}: owner profile recovery`, async (t) => {
      let f = fixture(t);
      const from = `src/feature/${name}`,
        p = await f.runtime.plan(f.command(from));
      assert.equal(p.state, "planned", JSON.stringify(p));
      const input = join(f.root, "crash.json"),
        root = f.root;
      writeFileSync(
        input,
        JSON.stringify({
          native,
          root,
          movePolicy: f.movePolicy,
          sourceKinds: f.sourceKinds,
          extraFolderPolicies: f.extraFolderPolicies,
          command: applyCommand(p),
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
      f = profileMoveFixture(native, root);
      t.after(() => f.close());
      const recovery = await f.runtime.inspectRecovery(getCommand(p));
      assert.deepEqual(recovery.actions, ["resume"]);
      const done = await f.runtime.recover({
        ...getCommand(p),
        recoveryPlanId: recovery.recoveryPlanId,
        recoveryPlanHash: recovery.recoveryPlanHash,
        expectedRevision: recovery.revision,
        requestId: randomUUID(),
        action: "resume",
      });
      assert.equal(done.state, "completed", JSON.stringify(done));
      assert.equal(f.control.writes, 3 - atWrite);
      const receipt = await f.runtime.receipt(getCommand(done));
      for (const item of receipt!.changedArtifacts!)
        assert.equal(
          item.sha256,
          sha256Bytes(readFileSync(join(f.checkout, item.path))),
        );
    });
