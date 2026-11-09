/**
 * @file .ai/tools/engineering/test/codexAgentFilesystem.test.ts
 * @version 1.0.0
 * @date 2026-11-09
 * @description Проверяет публикацию Codex-роли через общий filesystem runtime с preview и replay.
 * @see documentation/specifications/agent-authoring.md
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { renderCodexAgent } from "../src/projectEngineering.index.ts";
import {
  filesystemFixture,
  contentCommand,
  planCommand,
  applyCommand,
  getCommand,
} from "./filesystemIntegration.fixture.ts";

test("Codex role is published through native runtime with exact bytes and replay", async () => {
  const build = mkdtempSync(join(homedir(), ".cache", "codex-agent-native-"));
  let f: ReturnType<typeof filesystemFixture> | undefined;
  try {
    const native = JSON.parse(
      execFileSync(
        process.execPath,
        ["scripts/buildEngineeringNative.mjs", "--output", build],
        { encoding: "utf8", timeout: 60000 },
      ),
    );
    f = filesystemFixture(native, undefined, undefined, [], undefined, [
      {
        id: "agents",
        version: "1",
        root: ".codex/agents",
        ownerRef: ".codex",
        purpose: "Codex agents",
        boundary: "owner",
        allowedKinds: ["codex.agent"],
        allowedProvenance: ["authored"],
        sourcePaths: [".codex/README.md"],
      },
    ]);
    for (const path of [
      ".codex/README.md",
      "documentation/specifications/agent-authoring.md",
      ".ai/tools/engineering/src/validateCodexAgent.validator.ts",
      ".ai/tools/engineering/src/renderCodexAgent.util.ts",
      ".ai/tools/engineering/src/CodexAgent.types.ts",
    ]) {
      mkdirSync(dirname(join(f.checkout, path)), { recursive: true });
      writeFileSync(join(f.checkout, path), readFileSync(path));
    }
    mkdirSync(join(f.checkout, ".codex/agents"), { recursive: true });
    const bytes = renderCodexAgent({
      name: "frontend-guardrail",
      description: "Review",
      developer_instructions: "Read only.",
    });
    const content = await f.runtime.prepareContent(contentCommand(bytes));
    const plan = await f.runtime.plan(
      planCommand([
        {
          kind: "create_file",
          path: ".codex/agents/frontend-guardrail.toml",
          artifactKind: "codex.agent",
          contentRef: content.contentRef,
        },
      ]),
    );
    assert.equal(plan.state, "planned", JSON.stringify(plan));
    const preview = await f.runtime.preview({
      ...getCommand(plan),
      planId: plan.planRef!.planId,
      after: null,
      limit: 10,
    });
    assert.equal(preview.effects.length, 1);
    const command = applyCommand(plan),
      done = await f.runtime.apply(command);
    assert.equal(done.state, "completed", JSON.stringify(done));
    assert.deepEqual(
      readFileSync(join(f.checkout, ".codex/agents/frontend-guardrail.toml")),
      Buffer.from(bytes),
    );
    assert.deepEqual(await f.runtime.apply(command), done);
  } finally {
    if (f) {
      f.close();
      rmSync(f.root, { recursive: true, force: true });
    }
    rmSync(build, { recursive: true, force: true });
  }
});
