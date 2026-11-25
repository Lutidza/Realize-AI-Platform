/**
 * @file .ai/tools/worker-assignment/test/prepareAssignment.test.ts
 * @version 1.1.0
 * @date 2026-11-25
 * @description Проверяет подготовку статического назначения на изолированных файлах без исполнителя.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test, type TestContext } from "node:test";
import { stringify } from "yaml";
import { createRepositoryReadPolicy } from "../../../../services/ai-control-plane/src/repositoryReadPolicy.validator";
import { prepareAssignment } from "../src/prepareAssignment.service";

const rule = ".ai/rules/development/example.md";
const lockPath = ".ai/templates/assignment.lock.json";
const manifestPath = ".ai/templates/assignment.md";
const digest = (text: string) =>
  createHash("sha256").update(text).digest("hex");

/** Формирует отдельную привязку и рабочую копию на каждый сценарий. */
async function fixture(t: TestContext, writePaths: string[] = []) {
  const root = await mkdtemp(join(tmpdir(), "realize-assignment-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const scope = ["src/route.ts", "src/form/view.ts"];
  const files = new Map([
    ["AGENTS.md", "Общие инструкции\n"],
    [rule, "Обязательное правило\n"],
    [scope[0], "// route\n"],
    [scope[1], "// view\n"],
  ]);
  const identity = {
    id: "test-assignment",
    revision: 1,
    baseCommit: "a".repeat(40),
  };
  const yaml = stringify({
    ...identity,
    mission: "Проверить форму",
    assignedBy: "orchestrator",
    returnsTo: "orchestrator",
    ownerLayer: "src/form/",
    role: "AGENTS.md",
    roleReason: "Проверка",
    mode: "static-read-only",
    requiredSources: ["AGENTS.md", rule],
    reviewScope: {
      route: scope[0],
      directory: "src/form/",
      files: ["view.ts"],
    },
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
  const lock = JSON.stringify({
    ...identity,
    manifestPath,
    manifestSha256: digest(yaml),
    files: Object.fromEntries([...files].map(([p, text]) => [p, digest(text)])),
  });
  files.set(manifestPath, `# Образец\n\n\`\`\`yaml\n${yaml}\`\`\`\n`);
  files.set(lockPath, lock);
  for (const [path, text] of files) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), text);
  }
  const policy = await createRepositoryReadPolicy(root, true);
  return {
    root,
    run: () => prepareAssignment(policy, lockPath),
  };
}

test("полные тексты собираются без запуска; ready требует независимых подтверждений этой привязки", async (t) => {
  const f = await fixture(t);
  const preview = await f.run();
  assert.equal(preview.packageComplete, true);
  assert.equal(preview.status, "blocked");
  assert.deepEqual(
    preview.issues.map((x) => x.code),
    ["context_not_delivered", "adapter_unbound"],
  );
  assert.equal(
    preview.sources?.find((x) => x.path === rule)?.text,
    "Обязательное правило\n",
  );
});

test("отсутствующее или изменённое правило не попадает в подготовленный пакет", async (t) => {
  const f = await fixture(t);
  const path = join(f.root, rule);
  await rm(path);
  const missing = await f.run();
  assert.equal(missing.packageComplete, false);
  assert(missing.issues.some((x) => x.path === rule && x.code === "NOT_FOUND"));
  await writeFile(path, "Другая версия\n");
  const changed = await f.run();
  assert.equal(changed.status, "blocked");
  assert(changed.issues.some((x) => x.path === rule && x.code === "CONFLICT"));
  assert(changed.sources);
  assert(!changed.sources.some((x) => x.path === rule));
});

test("запись в назначении блокирует подготовку", async (t) => {
  const requested = await fixture(t, ["src/form/view.ts"]);
  assert.equal((await requested.run()).issues[0].code, "INVALID_INPUT");
});
