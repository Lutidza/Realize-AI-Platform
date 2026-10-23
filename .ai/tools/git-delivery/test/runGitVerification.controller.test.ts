/**
 * @file .ai/tools/git-delivery/test/runGitVerification.controller.test.ts
 * @version 1.0.0
 * @date 2026-10-22
 * @description Проверяет границу CLI: личный план, правильный checkout и отсутствие запуска при ошибке.
 */
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../../../", import.meta.url)).replace(
  /\/$/u,
  "",
);
const controller = join(
  root,
  ".ai/tools/git-delivery/src/verification/runGitVerification.controller.ts",
);

async function fixture(context: TestContext) {
  const directory = await mkdtemp(join(tmpdir(), "realize-verification-cli-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

function invoke(
  args: string[],
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      ["--import", "tsx", controller, ...args],
      { cwd: root },
      (error, stdout, stderr) => {
        resolve({
          code: typeof error?.code === "number" ? error.code : error ? -1 : 0,
          stdout,
          stderr,
        });
      },
    );
  });
}

test("CLI отклоняет лишние аргументы до чтения плана", async () => {
  const report = await invoke([
    "run",
    "--plan",
    "/missing-plan.json",
    "unexpected",
  ]);
  assert.equal(report.code, 2);
  assert.equal(
    JSON.parse(report.stdout).errorCode,
    "verification_command_invalid",
  );
});

test("ошибка схемы не выводит содержимое личного плана", async (context) => {
  const directory = await fixture(context);
  const path = join(directory, "plan.json");
  await writeFile(path, JSON.stringify({ secret: "fixture-private-marker" }), {
    mode: 0o600,
  });
  const report = await invoke(["run", "--plan", path]);
  assert.equal(report.code, 2);
  assert.equal(
    JSON.parse(report.stdout).errorCode,
    "verification_plan_invalid",
  );
  assert.doesNotMatch(report.stdout + report.stderr, /fixture-private-marker/u);
});

test("чужой checkout отклоняется до запуска команды", async (context) => {
  const directory = await fixture(context);
  const path = join(directory, "plan.json");
  const marker = join(directory, "executed");
  await writeFile(
    path,
    JSON.stringify({
      version: 1,
      projectId: "fixture",
      taskId: "cli-root",
      repositoryRoot: directory,
      checks: [
        {
          id: "check",
          command: [
            "node",
            "-e",
            `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'executed')`,
          ],
          inputs: ["source.ts"],
          timeoutMs: 1000,
          reuse: "local",
          extent: "targeted",
        },
      ],
    }),
    { mode: 0o600 },
  );
  const report = await invoke(["run", "--plan", path]);
  assert.equal(report.code, 2);
  assert.equal(
    JSON.parse(report.stdout).errorCode,
    "verification_root_mismatch",
  );
  await assert.rejects(access(marker), { code: "ENOENT" });
});

test("CLI не принимает общий файл плана", async (context) => {
  const directory = await fixture(context);
  const path = join(directory, "public.json");
  await writeFile(path, "{}", { mode: 0o644 });
  const report = await invoke(["status", "--plan", path]);
  assert.equal(report.code, 2);
  assert.equal(JSON.parse(report.stdout).errorCode, "context_unsafe");
});
