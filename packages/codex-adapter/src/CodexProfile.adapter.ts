/**
 * @file packages/codex-adapter/src/CodexProfile.adapter.ts
 * @version 1.1.0
 * @date 2026-09-09
 * @description Управляет файлами и окружением отдельного серверного профиля Codex.
 */

import { constants } from "node:fs";
import { chmod, lstat, mkdir, open, realpath, unlink } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";

import { CodexProfileError } from "./CodexProfile.error";
import type { PrepareCodexProfileInput } from "./CodexProfile.types";
import { createCodexEnvironment } from "./environment";
import { readCodexAccessTokenCredential } from "./CodexAccessTokenCredential.adapter";
import { readCodexWorkloadIdentityConfiguration } from "./readCodexWorkloadIdentityConfiguration.config";
import { validateCodexCredential } from "./validateCodexCredential.validator";

const requirePrivateDirectory = async (home: string): Promise<void> => {
  if (!isAbsolute(home) || resolve(home) !== home || home.includes("\0"))
    throw new CodexProfileError();
  await mkdir(home, { mode: 0o700, recursive: true });
  const directory = await lstat(home);
  if (
    !directory.isDirectory() ||
    directory.isSymbolicLink() ||
    (await realpath(home)) !== home ||
    (process.getuid && directory.uid !== process.getuid())
  )
    throw new CodexProfileError();
  await chmod(home, 0o700);
};

const writePrivateFile = async (
  path: string,
  content: string,
): Promise<void> => {
  const file = await open(
    path,
    constants.O_CREAT |
      constants.O_WRONLY |
      constants.O_NOFOLLOW |
      constants.O_NONBLOCK,
    0o600,
  );
  try {
    const stats = await file.stat();
    if (
      !stats.isFile() ||
      stats.nlink !== 1 ||
      (process.getuid && stats.uid !== process.getuid())
    )
      throw new CodexProfileError();
    await file.chmod(0o600);
    await file.truncate(0);
    await file.writeFile(content, "utf8");
  } finally {
    await file.close();
  }
};

/** Задаёт изолированный CODEX_HOME и авторизацию; не читает и не изменяет global Codex home. */
export const prepareCodexProfile = async (
  input: PrepareCodexProfileInput,
): Promise<NodeJS.ProcessEnv> => {
  try {
    const auth =
      input.authJSON === undefined
        ? undefined
        : validateCodexCredential(input.authJSON, input.authMode);
    if (input.authMode === "accessToken" && auth === undefined)
      throw new CodexProfileError();
    const workload =
      input.authMode === "workloadIdentity"
        ? await readCodexWorkloadIdentityConfiguration(input.sourceEnvironment)
        : undefined;
    if (
      workload &&
      (workload.protectedDirectory === input.home ||
        workload.protectedDirectory.startsWith(`${input.home}/`))
    )
      throw new CodexProfileError();
    await requirePrivateDirectory(input.home);
    await writePrivateFile(
      join(input.home, "config.toml"),
      [
        'model_provider = "openai"',
        `cli_auth_credentials_store = "${input.authMode === "accessToken" || workload ? "ephemeral" : "file"}"`,
        `forced_login_method = "${input.authMode === "apiKey" ? "api" : "chatgpt"}"`,
        ...(workload
          ? [
              'default_permissions = "realize_wif_readonly"',
              "[permissions.realize_wif_readonly]",
              'extends = ":read-only"',
              "[permissions.realize_wif_readonly.filesystem]",
              `${JSON.stringify(workload.protectedDirectory)} = "deny"`,
              "[permissions.realize_wif_workspace]",
              'extends = ":workspace"',
              "[permissions.realize_wif_workspace.filesystem]",
              `${JSON.stringify(workload.protectedDirectory)} = "deny"`,
            ]
          : []),
        "",
      ].join("\n"),
    );
    // Login и run не должны подобрать credential другого источника из environment.
    const environment = createCodexEnvironment(input.sourceEnvironment);
    delete environment.OPENAI_API_KEY;
    delete environment.CODEX_HOME;
    delete environment.CODEX_API_KEY;
    delete environment.CODEX_ACCESS_TOKEN;
    delete environment.OPENAI_FEDERATION_RULE_ID;
    delete environment.OPENAI_IDENTITY_TOKEN_FILE;
    delete environment.OPENAI_WORKLOAD_IDENTITY_CONTEXT;
    environment.CODEX_HOME = input.home;
    if (input.authMode === "accessToken") {
      environment.CODEX_ACCESS_TOKEN = readCodexAccessTokenCredential(auth!);
    } else if (workload) {
      environment.OPENAI_FEDERATION_RULE_ID = workload.federationRuleID;
      environment.OPENAI_IDENTITY_TOKEN_FILE = workload.identityTokenFile;
    }
    if (auth !== undefined && input.authMode !== "accessToken")
      await writePrivateFile(join(input.home, "auth.json"), auth);
    else await removeCodexProfileAuth(input.home);
    return environment;
  } catch {
    throw new CodexProfileError();
  }
};

/** Читает только обычный ограниченный файл внутри проверенного собственного профиля. */
export const readCodexProfileAuth = async (home: string): Promise<string> => {
  try {
    await requirePrivateDirectory(home);
    const file = await open(
      join(home, "auth.json"),
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    try {
      const stats = await file.stat();
      if (
        !stats.isFile() ||
        stats.nlink !== 1 ||
        stats.size > 65_536 ||
        (process.getuid && stats.uid !== process.getuid())
      )
        throw new CodexProfileError();
      const bytes = Buffer.alloc(65_537);
      let total = 0;
      while (total < bytes.length) {
        const { bytesRead } = await file.read(
          bytes,
          total,
          bytes.length - total,
          total,
        );
        if (!bytesRead) break;
        total += bytesRead;
      }
      if (total > 65_536) throw new CodexProfileError();
      return new TextDecoder("utf-8", { fatal: true }).decode(
        bytes.subarray(0, total),
      );
    } finally {
      await file.close();
    }
  } catch {
    throw new CodexProfileError();
  }
};

/** Удаляет credential, сохраняя native threads для следующего thread/resume. */
export const removeCodexProfileAuth = async (home: string): Promise<void> => {
  try {
    await requirePrivateDirectory(home);
    await unlink(join(home, "auth.json")).catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
      },
    );
  } catch {
    throw new CodexProfileError();
  }
};
