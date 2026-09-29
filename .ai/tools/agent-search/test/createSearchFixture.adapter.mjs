/**
 * @file .ai/tools/agent-search/test/createSearchFixture.adapter.mjs
 * @version 1.0.1
 * @date 2026-09-26
 * @description Создаёт изолированный репозиторий для проверки настоящего CLI поиска.
 */
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const toolRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const repositoryRoot = path.resolve(toolRoot, "../../..");
export const FIXTURE_NEEDLE = "agent_fixture_needle_7fa8";

export function createSearchFixture(t, { populate = true } = {}) {
  const tasks = path.join(repositoryRoot, ".ai-workspace/tasks");
  mkdirSync(tasks, { recursive: true });
  const workspace = mkdtempSync(
    path.join(
      tasks,
      `${new Date().toISOString().slice(0, 10)}-agent-search-test-`,
    ),
  );
  t.after(() => rmSync(workspace, { recursive: true, force: true }));
  const root = path.join(workspace, "tmp/repository");
  const fixtureTool = path.join(root, ".ai/tools/agent-search");
  mkdirSync(fixtureTool, { recursive: true });
  for (const directory of ["bin", "src"])
    cpSync(path.join(toolRoot, directory), path.join(fixtureTool, directory), {
      recursive: true,
    });
  // Fixtures используют ровно установленные зависимости CLI, без повторной установки.
  symlinkSync(
    path.join(toolRoot, "node_modules"),
    path.join(fixtureTool, "node_modules"),
    "dir",
  );
  const write = (relative, content = `${FIXTURE_NEEDLE}\n`) => {
    const target = path.join(root, relative);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, content);
    return target;
  };
  if (populate)
    for (const file of [
      "README.md",
      "AGENTS.md",
      "documentation/current.md",
      "src/app/(app)/page.tsx",
      "src/components/Widget.tsx",
      "src/providers/Context.tsx",
      "src/collections/Products.ts",
      "src/globals/Header.ts",
      "src/blocks/Content.tsx",
      "src/payload.config.ts",
      "src/migrations/initial.ts",
      "packages/ui-kit/src/Widget.tsx",
      "packages/payload-ai-plugin/src/admin/Panel.tsx",
      "packages/payload-ai-plugin/src/server.ts",
      "services/api/server.ts",
      "scripts/check.mjs",
      "tests/sample.test.ts",
      ".ai/README.md",
      ".ai/rules/RULE-ONE.md",
      ".ai/checks/CHECK-ONE.md",
      ".ai/workflows/WORKFLOW.md",
      ".ai/roles/INDEX.md",
      ".ai/registry/INDEX.md",
      ".codex/README.md",
      ".codex/skills/one/SKILL.md",
      ".codex/agents/one.md",
      ".codex/prompts/one.md",
      "src/RealizeCore/services/search/index.ts",
      "src/RealizeCore/data/searchProfiles/index.ts",
      "src/RealizeCore/collections/Search/index.ts",
      "src/app/_realize/page.tsx",
      "src/app/(reference)/page.tsx",
      "documentation/reports/old.md",
      "documentation/temp/old.md",
      ".ai/research/old.md",
      ".ai/agents-evolution/observations/old.md",
      ".ai/tools/agent-runtime/runtime/generated.md",
      ".ai-workspace/tasks/one/drafts/result.md",
      "src/payload-types.ts",
      "src/payload-generated-schema.ts",
      "src/app/(payload)/admin/importMap.js",
      "packages/example/node_modules/dependency/index.ts",
      "packages/example/dist/index.ts",
      "packages/example/package-lock.json",
      "src/.env.local",
      "src/private.key",
    ])
      write(file);
  write(".gitignore", ".ai-workspace/\nignored/\n");
  const cli = path.join(fixtureTool, "bin/agent-search.mjs");
  const run = (args = [], options = {}) =>
    spawnSync(process.execPath, [cli, ...args], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 128 * 1024,
      timeout: 5000,
      ...options,
    });
  return { workspace, root, write, cli, run };
}
