/**
 * @file .ai/tools/git-delivery/test/loadGitWorkerSettings.adapter.test.ts
 * @version 1.1.0
 * @date 2026-09-09
 * @description Проверяет загрузку настроек и инструкций Git-воркера из временного проекта.
 */

import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import type { TestContext } from "node:test";

import { PolicyError } from "../src/contracts.ts";
import { loadGitWorkerSettings } from "../src/worker/loadGitWorkerSettings.adapter.ts";

const configPath = ".codex/agents/delivery/git/inspect.json";
const promptPath = ".codex/prompts/workflows/delivery/git/inspect.md";
const prompt = "Вызови git_inspect один раз.\n";
const validConfig = {
  model: "gpt-5.3-codex-spark",
  reasoningEffort: "low",
  timeoutMs: 30000,
};

test("commit использует свой профиль и prompt, неизвестное действие запрещено", async (t) => {
  const f = await fixture(t);
  await f.write(
    ".codex/agents/delivery/git/commit.json",
    JSON.stringify(validConfig),
  );
  await f.write(
    ".codex/prompts/workflows/delivery/git/commit.md",
    "Выполни локальный commit.",
  );
  assert.equal(
    (await loadGitWorkerSettings(f.root, "commit")).instructions,
    "Выполни локальный commit.",
  );
  await assert.rejects(
    loadGitWorkerSettings(f.root, "../commit" as "commit"),
    policyError("worker_action_unavailable"),
  );
});

async function fixture(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), "realize-git-inspect-settings-"));
  t.after(async () => {
    await rm(root, { recursive: true, force: true });
  });
  const write = async (path: string, content: string) => {
    const target = join(root, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content);
  };
  await write(promptPath, prompt);
  const config = (value: unknown) => write(configPath, JSON.stringify(value));
  await config(validConfig);
  return { root, write, config };
}

function policyError(code: string): (error: unknown) => boolean {
  return (error: unknown) => {
    assert.ok(error instanceof PolicyError);
    assert.equal(error.code, code);
    return true;
  };
}

test("loader читает config и prompt без зависимости от общих документов", async (t) => {
  const f = await fixture(t);
  const expected = {
    ...validConfig,
    instructions: prompt,
  };
  assert.deepEqual(await loadGitWorkerSettings(f.root, "inspect"), expected);

  for (const path of [
    "AGENTS.md",
    ".ai/rules/git/RULE-GIT-DELIVERY.md",
    ".ai/workflows/delivery/git/commit-push/WORKFLOW.md",
  ]) {
    await f.write(path, "Посторонний контекст.\n".repeat(32768));
  }
  assert.deepEqual(await loadGitWorkerSettings(f.root, "inspect"), expected);
});

test("loader принимает граничные timeout и поддерживаемые reasoningEffort", async (t) => {
  const f = await fixture(t);
  for (const timeoutMs of [1000, 120000]) {
    for (const reasoningEffort of ["low", "medium", "high"]) {
      await f.config({ ...validConfig, timeoutMs, reasoningEffort });
      const loaded = await loadGitWorkerSettings(f.root, "inspect");
      assert.equal(loaded.timeoutMs, timeoutMs);
      assert.equal(loaded.reasoningEffort, reasoningEffort);
    }
  }
});

test("loader отклоняет неизвестные поля и неверные типы конфигурации", async (t) => {
  const cases: { name: string; config: unknown }[] = [
    { name: "null", config: null },
    { name: "массив", config: [] },
    { name: "строка", config: "config" },
    { name: "пустой объект", config: {} },
    { name: "другой prompt", config: { ...validConfig, prompt: "foreign.md" } },
    {
      name: "другой root",
      config: { ...validConfig, repositoryRoot: "/foreign" },
    },
    { name: "другие actions", config: { ...validConfig, actions: ["commit"] } },
    {
      name: "fallback model",
      config: { ...validConfig, fallbackModel: "other" },
    },
    {
      name: "произвольные возможности",
      config: { ...validConfig, tools: ["shell"] },
    },
  ];
  for (const entry of cases) {
    await t.test(entry.name, async (child) => {
      const f = await fixture(child);
      await f.config(entry.config);
      await assert.rejects(
        loadGitWorkerSettings(f.root, "inspect"),
        policyError("worker_configuration_invalid"),
      );
    });
  }
});

test("loader отклоняет неверные model, reasoningEffort и timeout", async (t) => {
  const cases: { name: string; field: string; value: unknown }[] = [
    ...[
      undefined,
      null,
      5,
      [validConfig.model],
      "",
      "a",
      "GPT-5",
      "gpt 5",
      "../spark",
      "spark\n",
      "g".repeat(97),
    ].map((value, index) => ({
      name: `model ${index}`,
      field: "model",
      value,
    })),
    ...[undefined, null, 1, true, "", "ultra", ["low"], { value: "low" }].map(
      (value, index) => ({
        name: `reasoningEffort ${index}`,
        field: "reasoningEffort",
        value,
      }),
    ),
    ...[
      undefined,
      null,
      "30000",
      true,
      0,
      999,
      120001,
      -1000,
      1000.5,
      Number.MAX_SAFE_INTEGER,
    ].map((value, index) => ({
      name: `timeoutMs ${index}`,
      field: "timeoutMs",
      value,
    })),
  ];
  for (const entry of cases) {
    await t.test(entry.name, async (child) => {
      const f = await fixture(child);
      await f.config({ ...validConfig, [entry.field]: entry.value });
      await assert.rejects(
        loadGitWorkerSettings(f.root, "inspect"),
        policyError("worker_configuration_invalid"),
      );
    });
  }
});

test("loader не подменяет отсутствующую или повреждённую конфигурацию defaults", async (t) => {
  const f = await fixture(t);
  await rm(join(f.root, configPath));
  await assert.rejects(loadGitWorkerSettings(f.root, "inspect"), {
    code: "ENOENT",
  });

  await f.write(configPath, "{broken");
  await assert.rejects(loadGitWorkerSettings(f.root, "inspect"), SyntaxError);
});

test("loader отклоняет отсутствие обязательного prompt", async (t) => {
  const f = await fixture(t);
  await rm(join(f.root, promptPath));
  await assert.rejects(loadGitWorkerSettings(f.root, "inspect"), {
    code: "ENOENT",
  });
});

test("loader отклоняет пустые и превышающие байтовый лимит инструкции", async (t) => {
  const f = await fixture(t);
  for (const content of ["", " \n\t", "x".repeat(32769), "я".repeat(16385)]) {
    await f.write(promptPath, content);
    await assert.rejects(
      loadGitWorkerSettings(f.root, "inspect"),
      policyError("worker_instructions_invalid"),
    );
  }
  await f.write(promptPath, "x".repeat(32768));
  const loaded = await loadGitWorkerSettings(f.root, "inspect");
  assert.equal(loaded.instructions, "x".repeat(32768));
});
