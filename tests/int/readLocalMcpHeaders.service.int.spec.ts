/**
 * @file tests/int/readLocalMcpHeaders.service.int.spec.ts
 * @version 1.0.0
 * @date 2026-09-24
 * @description Проверяет private-file auth helper без реальных credentials и загрузки .env приложения.
 */
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, writeFile, rm, chmod, symlink, link } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { readLocalMcpHeaders } from "../../scripts/runtime/readLocalMcpHeaders.service.mjs";

describe("local MCP header helper", () => {
  let root: string;
  let credentialFile: string;
  let token: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "realize-s1-auth-"));
    credentialFile = join(root, "client.env");
    token = randomBytes(32).toString("base64url");
    await writeFile(
      credentialFile,
      `REALIZE_MCP_CLIENT_TOKEN=${token}\nUNRELATED_VALUE=ignored\n`,
      { mode: 0o600 },
    );
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });
  it("возвращает только auth header и приоритет явного окружения", async () => {
    expect(
      await readLocalMcpHeaders({ environment: {}, credentialFile }),
    ).toEqual({ Authorization: `Bearer ${token}` });
    const replacement = randomBytes(32).toString("base64url");
    expect(
      await readLocalMcpHeaders({
        environment: { REALIZE_MCP_CLIENT_TOKEN: replacement },
        credentialFile: join(root, "absent"),
      }),
    ).toEqual({ Authorization: `Bearer ${replacement}` });
  });
  it("отклоняет доступ группы, symlink, hardlink и большой файл", async () => {
    await chmod(credentialFile, 0o640);
    await expect(
      readLocalMcpHeaders({ environment: {}, credentialFile }),
    ).rejects.toThrow("NOT_PRIVATE");
    await chmod(credentialFile, 0o600);
    const symbolic = join(root, "link.env");
    await symlink(credentialFile, symbolic);
    await expect(
      readLocalMcpHeaders({ environment: {}, credentialFile: symbolic }),
    ).rejects.toThrow();
    await link(credentialFile, join(root, "hard.env"));
    await expect(
      readLocalMcpHeaders({ environment: {}, credentialFile }),
    ).rejects.toThrow("NOT_PRIVATE");
    const large = join(root, "large.env");
    await writeFile(large, "x".repeat(8193), { mode: 0o600 });
    await expect(
      readLocalMcpHeaders({ environment: {}, credentialFile: large }),
    ).rejects.toThrow("NOT_PRIVATE");
  });
  it.each([
    "",
    "invalid",
    "a".repeat(42),
    "a".repeat(129),
    "a".repeat(43) + "\r\nInjected: header",
  ])("отказывает некорректному credential без fallback", async (invalid) => {
    await expect(
      readLocalMcpHeaders({
        environment: { REALIZE_MCP_CLIENT_TOKEN: invalid },
        credentialFile,
      }),
    ).rejects.toThrow("UNAVAILABLE");
  });
});
