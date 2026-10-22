/**
 * @file tests/int/git-secrets-script.int.spec.ts
 * @version 1.0.0
 * @date 2026-10-22
 * @description Проверяет штатный Node-вход secrets check с общим Git-пакетом на одноразовом репозитории.
 */
// @vitest-environment node
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { disposableGitFixture } from "./fixtures/disposableGit.fixture";

const execute = promisify(execFile);
const script = resolve("scripts/security/check-secrets.mjs");
describe("Git runtime: Node secrets check", () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "realize-secret-check-"));
    await disposableGitFixture(root).run(["init", "--template="]);
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });
  it("запускается штатной командой node без дополнительных loader flags", async () => {
    await writeFile(join(root, "safe.txt"), "safe source");
    const result = await execute(process.execPath, [script], {
      cwd: root,
      timeout: 10_000,
    });
    expect(result.stdout).toContain("Checked 1 versionable files");
  });
  it("блокирует сигнатуру секрета и сообщает только имя файла", async () => {
    const fakeToken = `ghp_${"Q".repeat(36)}`;
    await writeFile(join(root, "unsafe.txt"), fakeToken);
    await expect(
      execute(process.execPath, [script], { cwd: root, timeout: 10_000 }),
    ).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining("unsafe.txt: github-token"),
    });
    try {
      await execute(process.execPath, [script], { cwd: root, timeout: 10_000 });
    } catch (error) {
      expect(String((error as { stderr: string }).stderr)).not.toContain(
        fakeToken,
      );
    }
  });
});
