/**
 * @file .ai/tools/worker-assignment/test/temporaryAssignment.fixture.ts
 * @version 1.1.1
 * @date 2026-11-26
 * @description Создаёт временный репозиторий с манифестом назначения и закреплёнными версиями его файлов.
 */
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { TestContext } from "node:test";
import { stringify } from "yaml";
import { createRepositoryReadPolicy } from "realize-ai-platform/repository-read-policy";

export const rulePath = ".ai/rules/development/example.md";
export const requiredSources = ["AGENTS.md", rulePath];
const lockPath = ".ai/templates/assignment.lock.json";
const manifestPath = ".ai/templates/assignment.md";

interface FixtureOptions {
  reviewScope?: { paths: string[] };
  reviewFileContents?: Readonly<Record<string, string>>;
  writePaths?: string[];
}

const digest = (text: string) =>
  createHash("sha256").update(text).digest("hex");

/** Закрепляет синтетические инструкции и выбранные файлы. Каталог удаляется по завершении теста. */
export async function createTemporaryAssignment(
  t: TestContext,
  {
    reviewScope,
    reviewFileContents = {},
    writePaths = [],
  }: FixtureOptions = {},
) {
  const root = await mkdtemp(join(tmpdir(), "realize-assignment-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const identity = {
    id: "test-assignment",
    revision: 1,
    baseCommit: "a".repeat(40),
  };
  const scope = reviewScope ?? {
    route: "src/route.ts",
    directory: "src/module/",
    files: ["entry.ts"],
  };
  const reviewPaths =
    "paths" in scope
      ? scope.paths
      : [scope.route, ...scope.files.map((name) => scope.directory + name)];
  const yaml = stringify({
    ...identity,
    mission: "Проверить выбранные файлы",
    assignedBy: "orchestrator",
    returnsTo: "orchestrator",
    ownerLayer: "src/",
    role: "AGENTS.md",
    roleReason: "Проверка исходников",
    mode: "static-read-only",
    requiredSources,
    reviewScope: scope,
    permissions: {
      read: ["requiredSources", "reviewScope"],
      writePaths,
      tools: ["repo_read_file"],
      output: "reply-to-orchestrator",
    },
    checks: ["Проверить обязанности"],
    expectedOutput: ["Замечания"],
    stopCondition: "Недоступный файл",
  });
  const materials: Record<string, string> = {
    "AGENTS.md": "Общие инструкции\n",
    [rulePath]: "Обязательное правило\n",
    ...Object.fromEntries(
      reviewPaths.map((path) => [
        path,
        reviewFileContents[path] ?? `// ${path}\n`,
      ]),
    ),
  };
  const lock = {
    ...identity,
    manifestPath,
    manifestSha256: digest(yaml),
    files: Object.fromEntries(
      Object.entries(materials).map(([path, text]) => [path, digest(text)]),
    ),
  };
  const files = {
    ...materials,
    [manifestPath]: `# Образец\n\n\`\`\`yaml\n${yaml}\`\`\`\n`,
    [lockPath]: JSON.stringify(lock),
  };
  for (const [path, text] of Object.entries(files)) {
    const target = join(root, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, text);
  }
  const policy = await createRepositoryReadPolicy(root, true);
  return { root, policy, lockPath, lock };
}
