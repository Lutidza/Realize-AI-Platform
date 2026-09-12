/**
 * @file tests/int/CodexChatPermissions.int.spec.ts
 * @version 1.0.1
 * @date 2026-09-11
 * @description Проверяет allowlist снимка и запрет приватных каталогов chat sandbox без запуска модели.
 */

// @vitest-environment node

import {
  chmod,
  mkdir,
  mkdtemp,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createCodexChatPermissions } from "../../packages/codex-adapter/src/createCodexChatPermissions.config";

let root: string;
let cwd: string;
let binary: string;
let privateRoot: string;
let profileHome: string;
beforeEach(async () => {
  root = await realpath(
    await mkdtemp(join(tmpdir(), "realize-chat-permissions-")),
  );
  cwd = join(root, "snapshot");
  privateRoot = join(root, "private-assets");
  profileHome = join(root, "profile");
  await Promise.all([cwd, privateRoot, profileHome].map((path) => mkdir(path)));
  binary = join(root, "codex");
  await writeFile(binary, "fixture executable");
  await chmod(binary, 0o700);
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("Codex chat restricted read policy", () => {
  it("разрешает только снимок и runtime, закрывает root, asset storage и профиль авторизации", async () => {
    const result = await createCodexChatPermissions(cwd, {
      codexBinary: binary,
      privateReadDenyPaths: [privateRoot],
      environment: { NODE_ENV: "test", CODEX_HOME: profileHome },
    });
    expect(result).toEqual({
      binaryPath: binary,
      profile: {
        filesystem: {
          ":root": "deny",
          ":minimal": "read",
          [cwd]: "read",
          [binary]: "read",
          [privateRoot]: "deny",
          [profileHome]: "deny",
        },
        network: { enabled: false },
      },
    });
    expect(result.profile).not.toHaveProperty("extends");
  });

  it("сохраняет WIF assertion deny, включая каталог внутри разрешённого снимка", async () => {
    const assertionRoot = join(cwd, "identity");
    await mkdir(assertionRoot);
    const result = await createCodexChatPermissions(cwd, {
      codexBinary: binary,
      privateReadDenyPaths: [privateRoot],
      environment: {
        NODE_ENV: "test",
        CODEX_HOME: profileHome,
        OPENAI_FEDERATION_RULE_ID: "fixture-rule",
        OPENAI_IDENTITY_TOKEN_FILE: join(assertionRoot, "token"),
      },
    });
    expect(result.profile.filesystem[assertionRoot]).toBe("deny");
    expect(result.profile.filesystem[privateRoot]).toBe("deny");
  });

  it.each(["snapshot", "runtime"])(
    "не открывает %s внутри запрещённого каталога",
    async (target) => {
      await expect(
        createCodexChatPermissions(cwd, {
          codexBinary: binary,
          environment: { NODE_ENV: "test", CODEX_HOME: profileHome },
          privateReadDenyPaths: [target === "snapshot" ? cwd : root],
        }),
      ).rejects.toThrow();
    },
  );

  it("отклоняет symlink snapshot и glob-интерпретируемый путь", async () => {
    const alias = join(root, "alias");
    await symlink(cwd, alias);
    await expect(
      createCodexChatPermissions(alias, {
        codexBinary: binary,
        environment: { NODE_ENV: "test", CODEX_HOME: profileHome },
      }),
    ).rejects.toThrow();
    await expect(
      createCodexChatPermissions(cwd, {
        codexBinary: binary,
        environment: { NODE_ENV: "test", CODEX_HOME: profileHome },
        privateReadDenyPaths: [join(root, "*")],
      }),
    ).rejects.toThrow();
  });

  it("разрешает бинарный PATH alias только через его точный realpath", async () => {
    await symlink(binary, join(privateRoot, "codex"));
    const result = await createCodexChatPermissions(cwd, {
      environment: {
        NODE_ENV: "test",
        PATH: privateRoot,
        CODEX_HOME: profileHome,
      },
    });
    expect(result.binaryPath).toBe(binary);
    expect(result.profile.filesystem).not.toHaveProperty(privateRoot);
  });
});
