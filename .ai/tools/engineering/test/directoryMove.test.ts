/**
 * @file .ai/tools/engineering/test/directoryMove.test.ts
 * @version 1.0.0
 * @date 2026-10-29
 * @description Проверяет реальные directory move, полный receipt и запрет записи без прав на потомков.
 * @see documentation/architecture/engineering-operations.md
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { after, before, test } from "node:test";
import type { TestContext } from "node:test";
import { parseDocument } from "yaml";
import { sha256Bytes } from "@realize/engineering-runtime";
import type { LoadEngineeringNativeInput } from "@realize/engineering-runtime";
import { renderAiTemplate } from "../src/projectEngineering.index.ts";
import { directoryMoveFixture } from "./directoryMove.fixture.ts";
import {
  applyCommand,
  filesystemFixture,
  getCommand,
  planCommand,
  policySource,
} from "./filesystemIntegration.fixture.ts";

let native: LoadEngineeringNativeInput, build: string;
before(() => {
  build = mkdtempSync(
    join(homedir(), ".cache", "engineering-directory-native-"),
  );
  native = JSON.parse(
    execFileSync(
      process.execPath,
      ["scripts/buildEngineeringNative.mjs", "--output", build],
      {
        encoding: "utf8",
        timeout: 60_000,
      },
    ),
  );
});
after(() => {
  if (build) rmSync(build, { recursive: true, force: true });
});
function fixture(t: TestContext, caseOnly = false) {
  const f = caseOnly
    ? directoryMoveFixture(native, [], "src/move/Left", "src/move/left")
    : directoryMoveFixture(native);
  t.after(() => {
    f.close();
    rmSync(f.root, { recursive: true, force: true });
  });
  return f;
}

for (const caseOnly of [false, true]) {
  test(`directory move (case-only: ${caseOnly}) preserves empty directories, bytes/mode and complete final receipt`, async (t) => {
    const f = fixture(t, caseOnly);
    chmodSync(join(f.checkout, f.source), 0o640);
    chmodSync(join(f.checkout, f.empty), 0o750);
    const original = readFileSync(join(f.checkout, f.source));
    const beforeConsumer = readFileSync(join(f.checkout, f.consumer), "utf8");
    const rootInode = statSync(join(f.checkout, f.from)).ino;
    const emptyInode = statSync(join(f.checkout, f.empty)).ino;
    const plan = await f.runtime.plan(f.command());
    assert.equal(plan.state, "planned", JSON.stringify(plan));
    assert.deepEqual(readFileSync(join(f.checkout, f.source)), original);
    assert.equal(f.control.writes, 0);
    const preview = await f.runtime.preview({
      ...getCommand(plan),
      planId: plan.planRef!.planId,
      after: null,
      limit: 100,
    });
    assert.deepEqual(
      preview.effects.map((effect) => effect.kind),
      ["move", "edit_file", "edit_file", "edit_file"],
    );
    const moved = preview.effects[0].movedArtifacts!;
    assert.equal(moved.length, 5);
    assert.deepEqual(
      preview.effects[0].paths,
      moved.flatMap((item) => [item.from, item.to]),
    );
    for (const item of moved)
      assert.deepEqual(Object.keys(item).sort(), [
        "from",
        "kind",
        "sha256",
        "to",
      ]);
    const command = applyCommand(plan);
    const done = await f.runtime.apply(command);
    assert.equal(done.state, "completed", JSON.stringify(done));
    assert.equal(existsSync(join(f.checkout, f.from)), false);
    assert.equal(statSync(join(f.checkout, f.to)).ino, rootInode);
    assert.equal(statSync(join(f.checkout, f.to, "empty")).ino, emptyInode);
    assert.equal(statSync(join(f.checkout, f.to, "empty")).mode & 0o777, 0o750);
    assert.deepEqual(readdirSync(join(f.checkout, f.to, "empty")), []);
    const target = f.to + "/calculateTotal.util.ts";
    const expected = original
      .toString("utf8")
      .replace(f.source, target)
      .replace("@version 1.0.0", "@version 1.0.1")
      .replace("@date 2026-10-26", "@date 2026-10-28")
      .replace(
        '"../helper.util.js"',
        caseOnly ? '"../helper.util.js"' : '"../../helper.util.js"',
      );
    assert.deepEqual(
      readFileSync(join(f.checkout, target)),
      Buffer.from(expected),
    );
    assert.equal(statSync(join(f.checkout, target)).mode & 0o777, 0o640);
    assert.match(
      readFileSync(
        join(f.checkout, f.to, "nested/calculateDouble.util.ts"),
        "utf8",
      ),
      /from "\.\.\/calculateTotal\.util\.js"/,
    );
    assert.equal(
      readFileSync(join(f.checkout, f.consumer), "utf8"),
      beforeConsumer
        .replace(
          caseOnly
            ? "./Left/calculateTotal.util.js"
            : "./left/calculateTotal.util.js",
          caseOnly
            ? "./left/calculateTotal.util.js"
            : "./right/relocated/calculateTotal.util.js",
        )
        .replace("@version 1.0.0", "@version 1.0.1")
        .replace("@date 2026-10-26", "@date 2026-10-28"),
    );
    const receipt = await f.runtime.receipt(getCommand(done));
    assert.ok(receipt?.changedArtifacts);
    assert.deepEqual(
      receipt.changedArtifacts.map((item) => item.path).sort(),
      [
        f.to,
        target,
        f.to + "/empty",
        f.to + "/nested",
        f.to + "/nested/calculateDouble.util.ts",
        f.consumer,
      ].sort(),
    );
    for (const item of receipt.changedArtifacts) {
      assert.deepEqual(Object.keys(item).sort(), ["kind", "path", "sha256"]);
      assert.equal(
        item.sha256,
        item.kind === "directory"
          ? null
          : sha256Bytes(readFileSync(join(f.checkout, item.path))),
      );
    }
    assert.equal(
      new Set(receipt.changedArtifacts.map((item) => item.path)).size,
      receipt.changedArtifacts.length,
    );
    assert.equal(f.control.writes, 4);
    assert.deepEqual(await f.runtime.apply(command), done);
    assert.equal(f.control.writes, 4);
  });

  test(
    caseOnly
      ? "template case-only move refuses an invalid legacy purpose folder"
      : "template directory move updates owner_layer and incoming/outgoing links",
    async (t) => {
      const from = caseOnly
          ? ".ai/templates/move/Left"
          : ".ai/templates/move/left",
        to = caseOnly
          ? ".ai/templates/move/left"
          : ".ai/templates/move/right/relocated";
      const source = from + "/TEMPLATE-REVIEW.md",
        target = to + "/TEMPLATE-REVIEW.md";
      const consumer = ".ai/templates/move/TEMPLATE-CONSUMER.md";
      const f = filesystemFixture(native, undefined, undefined, [], {
        changedOn: "2026-10-28",
        coverage: "complete",
        referenceRoots: [".ai/templates/move"],
        sourcePaths: [policySource],
      });
      t.after(() => {
        f.close();
        rmSync(f.root, { recursive: true, force: true });
      });
      mkdirSync(join(f.checkout, dirname(to)), { recursive: true });
      mkdirSync(join(f.checkout, from, "empty"), { recursive: true });
      const make = (path: string, relatedArtifacts: string[], body: string) =>
        renderAiTemplate({
          path,
          templateId: path.split("/").at(-1)!.slice(0, -3),
          titleRu: "Проверка дерева",
          purposeRu: "Проверяет перенос.",
          usageRu: "Применяется при проверке.",
          sections: [{ headingRu: "Ссылки", body }],
          relatedArtifacts,
        });
      // У template profile uppercase purpose folder невалиден уже на исходной стороне.
      const original = Buffer.from(
        make(
          caseOnly ? target : source,
          [],
          "[База](../../markdown/TEMPLATE-AI-RUNTIME-MARKDOWN.md)",
        ),
      )
        .toString("utf8")
        .replaceAll(to + "/", from + "/");
      writeFileSync(join(f.checkout, source), original);
      writeFileSync(
        join(f.checkout, consumer),
        make(
          consumer,
          [source],
          `[Обзор](${caseOnly ? "Left" : "left"}/TEMPLATE-REVIEW.md#назначение)`,
        ),
      );
      const plan = await f.runtime.plan(
        planCommand([
          {
            kind: "move",
            from,
            to,
            expectedVersion: f.ports.directoryVersion(from),
          },
        ]),
      );
      if (caseOnly) {
        assert.equal(plan.state, "failed", JSON.stringify(plan));
        assert.equal(plan.error?.code, "INVALID_INPUT", JSON.stringify(plan));
        assert.equal(f.control.writes, 0);
        assert.equal(readFileSync(join(f.checkout, source), "utf8"), original);
        assert.equal(existsSync(join(f.checkout, to)), false);
        return;
      }
      assert.equal(plan.state, "planned", JSON.stringify(plan));
      const done = await f.runtime.apply(applyCommand(plan));
      assert.equal(done.state, "completed", JSON.stringify(done));
      const text = readFileSync(join(f.checkout, target), "utf8");
      const metadata = parseDocument(
        text.match(/```yaml\n([\s\S]*?)\n```/)![1],
      );
      assert.deepEqual(metadata.errors, []);
      assert.equal(metadata.get("template_id"), "TEMPLATE-REVIEW");
      assert.equal(metadata.get("owner_layer"), to + "/");
      assert.ok(
        text.includes(
          caseOnly
            ? "../../markdown/TEMPLATE-AI-RUNTIME-MARKDOWN.md"
            : "../../../markdown/TEMPLATE-AI-RUNTIME-MARKDOWN.md",
        ),
      );
      const updated = readFileSync(join(f.checkout, consumer), "utf8");
      assert.ok(updated.includes(target));
      assert.ok(
        updated.includes(
          caseOnly
            ? "left/TEMPLATE-REVIEW.md#назначение"
            : "right/relocated/TEMPLATE-REVIEW.md#назначение",
        ),
      );
      const receipt = await f.runtime.receipt(getCommand(done));
      assert.deepEqual(
        receipt!.changedArtifacts!.map((item) => item.path).sort(),
        [to, to + "/empty", target, consumer].sort(),
      );
    },
  );

  test(`empty directory tree (case-only: ${caseOnly}) completes with directory-only receipt`, async (t) => {
    const f = fixture(t, caseOnly);
    rmSync(join(f.checkout, f.source));
    rmSync(join(f.checkout, f.from, "nested"), { recursive: true });
    rmSync(join(f.checkout, f.consumer));
    const plan = await f.runtime.plan(f.command());
    assert.equal(plan.state, "planned", JSON.stringify(plan));
    const done = await f.runtime.apply(applyCommand(plan));
    assert.equal(done.state, "completed", JSON.stringify(done));
    const receipt = await f.runtime.receipt(getCommand(done));
    assert.deepEqual(receipt!.changedArtifacts, [
      { path: f.to, kind: "directory", sha256: null },
      { path: f.to + "/empty", kind: "directory", sha256: null },
    ]);
    assert.equal(f.control.writes, 1);
  });

  for (const phase of ["plan", "apply"] as const) {
    test(`descendant ACL denial before ${phase} (case-only: ${caseOnly}) prevents checkout writes`, async (t) => {
      const f = fixture(t, caseOnly);
      const original = readFileSync(join(f.checkout, f.source));
      if (phase === "plan") f.control.deniedPaths = [f.to + "/empty"];
      const plan = await f.runtime.plan(f.command());
      const result =
        phase === "plan"
          ? plan
          : await (async () => {
              assert.equal(plan.state, "planned", JSON.stringify(plan));
              f.control.deniedPaths = [f.nested];
              return f.runtime.apply(applyCommand(plan));
            })();
      assert.notEqual(result.state, "completed");
      assert.equal(result.error?.code, "FORBIDDEN", JSON.stringify(result));
      assert.equal(f.control.writes, 0);
      assert.deepEqual(readFileSync(join(f.checkout, f.source)), original);
      assert.equal(existsSync(join(f.checkout, f.to)), false);
    });
  }
}
