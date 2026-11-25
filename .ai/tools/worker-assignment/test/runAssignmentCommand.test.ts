/**
 * @file .ai/tools/worker-assignment/test/runAssignmentCommand.test.ts
 * @version 1.0.0
 * @date 2026-11-25
 * @description Проверяет обработку аргументов и привязку примера через точку входа CLI.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, open, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { fileURLToPath } from "node:url";

async function runCommand(t: TestContext, argument: string) {
  const directory = await mkdtemp(join(tmpdir(), "realize-assignment-cli-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "output");
  const output = await open(path, "wx");
  try {
    const command = spawn(
      "npm",
      ["run", "--silent", "ai:assignment", "--", argument],
      {
        cwd: fileURLToPath(new URL("../../../../", import.meta.url)),
        stdio: ["ignore", output.fd, output.fd],
      },
    );
    const [code] = await once(command, "close");
    return { code, text: await readFile(path, "utf8") };
  } finally {
    await output.close();
  }
}

test("неизвестная команда возвращает подсказку и код 1", async (t) => {
  const result = await runCommand(t, "unknown");
  assert.equal(result.code, 1);
  assert.match(result.text, /ai:assignment -- prepare/);
});

test("prepare находит рабочую копию и опубликованную привязку примера", async (t) => {
  const result = await runCommand(t, "prepare");
  assert.equal(result.code, 2);
  const report = JSON.parse(result.text);
  assert.equal(report.assignment.id, "audit-create-article-001");
  assert.equal(report.status, "blocked");
});
