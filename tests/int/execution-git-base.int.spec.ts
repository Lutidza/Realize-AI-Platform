/**
 * @file tests/int/execution-git-base.int.spec.ts
 * @version 1.0.0
 * @date 2026-10-22
 * @description Проверяет базовый commit API через общий Git-исполнитель на одноразовом checkout.
 */
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveExecutionBaseCommit } from "../../packages/payload-ai-plugin/src/endpoints/gitRepository";
import { createRepositoryGitHeadFixture } from "./fixtures/repositoryGitHead.fixture";

describe("Execution API: общий machine-read Git", () => {
  let root: string;
  let head: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "realize-execution-base-"));
    await mkdir(join(root, "src"));
    await writeFile(join(root, "src/example.ts"), "export const value = 1;\n");
    const fixture = await createRepositoryGitHeadFixture(root);
    head = await fixture.commit("src/example.ts");
  });
  afterEach(async () => {
    vi.unstubAllEnvs();
    await rm(root, { recursive: true, force: true });
  });

  it("читает точный HEAD и не наследует подменённый GIT_DIR", async () => {
    vi.stubEnv("GIT_DIR", join(root, "missing-repository"));
    vi.stubEnv("GIT_CONFIG_COUNT", "1");
    vi.stubEnv("GIT_CONFIG_KEY_0", "core.hooksPath");
    vi.stubEnv("GIT_CONFIG_VALUE_0", "/unexpected-hooks");
    expect(await resolveExecutionBaseCommit(root)).toBe(head);
  });

  it("отклоняет подкаталог вместо владельца репозитория", async () => {
    await expect(
      resolveExecutionBaseCommit(join(root, "src")),
    ).rejects.toMatchObject({
      code: "AI_RUNTIME_UNAVAILABLE",
      status: 503,
    });
  });

  it("возвращает безопасную ошибку при недоступном Git", async () => {
    await rm(join(root, ".git"), { recursive: true, force: true });
    await expect(resolveExecutionBaseCommit(root)).rejects.toMatchObject({
      message: "Execution repository is unavailable or misconfigured.",
      status: 503,
    });
  });
});
