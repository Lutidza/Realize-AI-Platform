/**
 * @file .ai/tools/engineering/test/codexAgent.test.ts
 * @version 1.0.0
 * @date 2026-11-09
 * @description Проверяет native Codex profile, негативные входы и trusted folder policy.
 * @see documentation/specifications/agent-authoring.md
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  createProjectArtifactBinding,
  renderCodexAgent,
  validateCodexAgent,
} from "../src/projectEngineering.index.ts";
const input = {
  name: "frontend-guardrail",
  description: "Проверка",
  developer_instructions: 'Ничего не меняй.\nПроверь "компонент" и \\ путь.',
};
const path = ".codex/agents/frontend/next-react/guardrail/agent.toml";
test("native profile preserves instructions and rejects unknown or duplicate fields", () => {
  const source = new TextDecoder().decode(renderCodexAgent(input));
  assert.deepEqual(validateCodexAgent(source), input);
  assert.deepEqual(renderCodexAgent(input), renderCodexAgent(input));
  for (const extra of [
    'prompt = "path"\n',
    'name = "other"\n',
    'sandbox_mode = "read-only"\n',
  ])
    assert.throws(() => validateCodexAgent(source + extra));
  assert.throws(() =>
    renderCodexAgent({ ...input, prompt: "path" } as typeof input),
  );
  assert.throws(() =>
    renderCodexAgent({ ...input, developer_instructions: "" }),
  );
  assert.throws(() => renderCodexAgent({ ...input, name: "../escape" }));
  assert.throws(() => renderCodexAgent({ ...input, description: "\0" }));
});
test("binding enforces host placement and exposes only performed checks", () => {
  const binding = createProjectArtifactBinding({
    readReference: readFileSync,
    folderPolicies: [
      {
        id: "codex-agents",
        version: "1",
        root: ".codex/agents",
        ownerRef: ".codex",
        purpose: "Определения Codex",
        boundary: "owner",
        allowedKinds: ["codex.agent"],
        allowedProvenance: ["authored"],
        sourcePaths: [".codex/README.md"],
      },
    ],
  });
  const result = binding.resolveFile({
    path,
    artifactKind: "codex.agent",
    content: renderCodexAgent(input),
  });
  assert.equal(result.kindId, "codex.agent");
  assert.deepEqual(result.validatedChecks, [
    "agent.native",
    "folder.placement",
  ]);
  assert.ok(!result.validatedChecks.includes("agent.runtime"));
  assert.throws(() =>
    binding.resolveFile({
      path: "src/agent.toml",
      artifactKind: "codex.agent",
      content: renderCodexAgent(input),
    }),
  );
  assert.throws(() =>
    binding.resolveFile({
      path,
      artifactKind: "codex.agent",
      content: new TextEncoder().encode('prompt = "path"\n'),
    }),
  );
});

test("native TOML is accepted by an independent parser", async () => {
  const { execFileSync } = await import("node:child_process");
  const parsed = JSON.parse(
    execFileSync(
      "python3",
      [
        "-c",
        "import sys,tomllib,json; print(json.dumps(tomllib.loads(sys.stdin.read())))",
      ],
      { input: renderCodexAgent(input) },
    ).toString(),
  );
  assert.deepEqual(parsed, input);
});
