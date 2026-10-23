// @vitest-environment node
/**
 * @file tests/int/execution-check-verification.int.spec.ts
 * @version 1.1.0
 * @date 2026-10-23
 * @description Проверяет общий verification runtime через platform adapter на реальных изолированных Node/npm процессах.
 */
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runExecutionCheck } from "../../services/ai-execution-worker/src/checkRunner";
import { withWorkspaceDependencies } from "../../services/ai-execution-worker/src/workspaceDependencies";
import { createExecutionVerificationPlan } from "../../services/ai-execution-worker/src/createExecutionVerificationPlan.config";
import type { ExecutionCheckInput } from "../../services/ai-execution-worker/src/ExecutionVerification.types";

const roots: string[] = [];
const reason = "Проверка включена в одобренный план change:41, plan:fixture.";

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "realize-execution-verification-"));
  roots.push(root);
  const runtimeManifest = JSON.parse(
    await readFile(new URL("../../package.json", import.meta.url), "utf8"),
  );
  const repository = join(root, "repository");
  const workspaces = [join(root, "execution"), join(root, "promotion")];
  const counter = join(repository, "counter.txt");
  await mkdir(join(repository, "node_modules", "fixture"), { recursive: true });
  await writeFile(
    join(repository, "node_modules", "fixture", "index.js"),
    "module.exports = 1;\n",
  );
  await writeFile(
    join(repository, "node_modules", ".package-lock.json"),
    "{}\n",
  );
  for (const workspace of workspaces) {
    await mkdir(join(workspace, "src"), { recursive: true });
    await writeFile(
      join(workspace, "src", "input.js"),
      "export const value = 1;\n",
    );
    await writeFile(
      join(workspace, "package.json"),
      JSON.stringify({
        name: "verification-fixture",
        version: "1.0.0",
        private: true,
        engines: runtimeManifest.engines,
        packageManager: runtimeManifest.packageManager,
        scripts: Object.fromEntries(
          [
            "typecheck",
            "lint",
            "format:check",
            "build",
            "test:int",
            "test:e2e",
            "payload:migrate:status",
          ].map((name) => [name, "node check.cjs"]),
        ),
      }),
    );
    await writeFile(
      join(workspace, "check.cjs"),
      [
        "const fs = require('node:fs');",
        "fs.appendFileSync(process.env.COUNTER, 'executed\\n');",
        "if (process.env.MUTATE_INPUT === 'true') fs.appendFileSync('src/input.js', '// changed\\n');",
        "console.log('Проверка выполнена');",
        "console.log(process.cwd());",
        "if (process.env.npm_lifecycle_event === 'test:e2e') { for (const directory of ['playwright-report', 'test-results']) { fs.mkdirSync(directory, { recursive: true }); fs.writeFileSync(directory + '/result.json', JSON.stringify({ time: Date.now() })); } }",
        "if (process.env.FAIL_CHECK === 'true') process.exitCode = 1;",
      ].join("\n"),
    );
    await mkdir(join(workspace, "scripts", "security"), { recursive: true });
    await writeFile(
      join(workspace, "scripts", "security", "check-secrets.mjs"),
      "import '../../check.cjs';\n",
    );
  }
  const count = async () =>
    (await readFile(counter, "utf8").catch(() => ""))
      .trim()
      .split("\n")
      .filter(Boolean).length;
  const run = async (
    workspace: string,
    overrides: Partial<
      Pick<ExecutionCheckInput, "command" | "environment">
    > = {},
  ) =>
    withWorkspaceDependencies(repository, workspace, (dependencyLease) =>
      runExecutionCheck({
        command: overrides.command ?? "npm run typecheck",
        environment: { COUNTER: counter, ...overrides.environment },
        repositoryRoot: repository,
        workspace,
        verification: { changeRequestID: 41, dependencyLease, reason },
      }),
    );
  return { repository, workspaces, counter, count, run };
}

afterEach(async () => {
  for (const root of roots.splice(0))
    await rm(root, { force: true, recursive: true });
});

describe("platform verification adapter", () => {
  it("повторно использует проверку в другом worktree после новой копии тех же зависимостей", async () => {
    const f = await fixture();
    const first = await f.run(f.workspaces[0]);
    const second = await f.run(f.workspaces[1]);
    expect(first.status, first.outputSummary).toBe("passed");
    expect(second.status, second.outputSummary).toBe("passed");
    expect(await f.count()).toBe(1);
    expect(second.outputSummary).toContain("Использован сохранённый результат");
    expect(second.evidenceHash).toBe(first.evidenceHash);
    expect(second.outputSummary).not.toContain(f.repository);
    expect(second.outputSummary).not.toContain(f.workspaces[0]);
    expect(second.outputSummary).not.toContain(f.workspaces[1]);
    expect(second.outputSummary).not.toContain(".ai-workspace");
  });

  it("добавление нового source-каталога и изменение окружения отменяют reuse", async () => {
    const f = await fixture();
    expect((await f.run(f.workspaces[0])).status).toBe("passed");
    await mkdir(join(f.workspaces[1], "new-owner"));
    await writeFile(
      join(f.workspaces[1], "new-owner", "added.ts"),
      "export const added = true;\n",
    );
    expect((await f.run(f.workspaces[1])).status).toBe("passed");
    expect(
      (
        await f.run(f.workspaces[1], {
          environment: { FIXTURE_MODE: "changed" },
        })
      ).status,
    ).toBe("passed");
    expect(await f.count()).toBe(3);
  });

  it("учитывает generated Next types, даже когда .next исключён из общего scan", async () => {
    const f = await fixture();
    expect((await f.run(f.workspaces[0])).status).toBe("passed");
    await mkdir(join(f.workspaces[1], ".next", "types"), { recursive: true });
    await writeFile(
      join(f.workspaces[1], ".next", "types", "routes.d.ts"),
      "export type Route = '/';\n",
    );
    expect((await f.run(f.workspaces[1])).status).toBe("passed");
    expect(await f.count()).toBe(2);
  });

  it("учитывает новые скрытые JS-каталоги, которые читает eslint .", async () => {
    const f = await fixture();
    expect(
      (await f.run(f.workspaces[0], { command: "npm run lint" })).status,
    ).toBe("passed");
    await mkdir(join(f.workspaces[1], ".runtime"));
    await writeFile(
      join(f.workspaces[1], ".runtime", "new.js"),
      "module.exports = true;\n",
    );
    expect(
      (await f.run(f.workspaces[1], { command: "npm run lint" })).status,
    ).toBe("passed");
    expect(await f.count()).toBe(2);
  });

  it.each([
    "npm run build",
    "npm run test:int",
    "npm run test:e2e",
    "npm run payload:migrate:status",
    "node scripts/security/check-secrets.mjs",
  ])("исполняет %s заново при неизменных source inputs", async (command) => {
    const f = await fixture();
    for (const workspace of f.workspaces) {
      const result = await f.run(workspace, { command });
      expect(result.status, result.outputSummary).toBe("passed");
      expect(result.outputSummary).not.toContain(
        "Использован сохранённый результат",
      );
    }
    expect(await f.count()).toBe(2);
  });

  it("отклоняет изменение исходника во время успешной команды", async () => {
    const f = await fixture();
    const result = await f.run(f.workspaces[0], {
      environment: { MUTATE_INPUT: "true" },
    });
    expect(result.status).toBe("failed");
    expect(result.outputSummary).toContain("verification_inputs_changed");
  });

  it("не принимает receipt из редактируемого worktree и повторяет failed check", async () => {
    const f = await fixture();
    await mkdir(
      join(f.workspaces[0], ".ai-workspace", "runtime", "verification"),
      { recursive: true },
    );
    await writeFile(
      join(
        f.workspaces[0],
        ".ai-workspace",
        "runtime",
        "verification",
        "forged.json",
      ),
      '{"status":"passed"}',
    );
    for (let attempt = 0; attempt < 2; attempt++) {
      expect(
        (await f.run(f.workspaces[0], { environment: { FAIL_CHECK: "true" } }))
          .status,
      ).toBe("failed");
    }
    expect(await f.count()).toBe(2);
  });

  it("сообщает ожидаемую и текущую версию Node до создания процесса", async () => {
    const f = await fixture();
    const path = join(f.workspaces[0], "package.json");
    const manifest = JSON.parse(await readFile(path, "utf8"));
    manifest.engines.node = "0.0.0";
    await writeFile(path, JSON.stringify(manifest));
    const result = await f.run(f.workspaces[0]);
    expect(result.status).toBe("failed");
    expect(result.outputSummary).toContain(
      "verification_node_version_mismatch",
    );
    expect(result.outputSummary).toContain(
      `Нужен Node.js 0.0.0; запущен ${process.versions.node}`,
    );
    expect(await f.count()).toBe(0);
  });

  it("отклоняет неизвестную команду до создания процесса", async () => {
    const f = await fixture();
    await expect(
      f.run(f.workspaces[0], { command: "npm run lint -- --fix" }),
    ).rejects.toThrow("not allowlisted");
    expect(await f.count()).toBe(0);
  });

  it("не смешивает независимые server repositories и change requests", async () => {
    const f = await fixture();
    await withWorkspaceDependencies(
      f.repository,
      f.workspaces[0],
      async (dependencyLease) => {
        const base: ExecutionCheckInput = {
          command: "npm run lint",
          repositoryRoot: f.repository,
          workspace: f.workspaces[0],
          verification: { changeRequestID: 41, dependencyLease, reason },
        };
        const original = createExecutionVerificationPlan(base);
        expect(
          createExecutionVerificationPlan({
            ...base,
            repositoryRoot: `${f.repository}-other`,
          }).projectId,
        ).not.toBe(original.projectId);
        expect(
          createExecutionVerificationPlan({
            ...base,
            verification: { ...base.verification, changeRequestID: 42 },
          }).taskId,
        ).not.toBe(original.taskId);
      },
    );
  });
});
