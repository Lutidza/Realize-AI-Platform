/**
 * @file packages/codex-adapter/src/createCodexOwnerHostEnvironment.config.ts
 * @version 1.0.0
 * @date 2026-10-23
 * @description Проверяет серверный owner-host допуск и формирует окружение native shell без credentials.
 */

import { realpathSync, statSync } from "node:fs";
import { userInfo } from "node:os";
import { dirname, isAbsolute, join, sep } from "node:path";
import type { CodexOwnerHostOptions } from "./OpenAICodex.types";

/** Не проверяет подпись grant повторно: owner/root/run admission принадлежит control plane. */
export function createCodexOwnerHostEnvironment(
  cwd: string,
  ownerHost: CodexOwnerHostOptions | undefined,
): Record<string, string> {
  const owner = userInfo();
  if (
    !ownerHost ||
    !ownerHost.osUser ||
    owner.uid <= 0 ||
    process.geteuid?.() === 0 ||
    owner.username === "root" ||
    owner.username !== ownerHost.osUser ||
    typeof cwd !== "string" ||
    !isAbsolute(cwd) ||
    cwd.includes("\0") ||
    cwd !== ownerHost.workspaceRoot ||
    realpathSync(cwd) !== cwd ||
    !statSync(cwd).isDirectory() ||
    !isAbsolute(owner.homedir) ||
    !owner.shell ||
    !isAbsolute(owner.shell)
  )
    throw new Error("codex_owner_host_admission_invalid");

  const attachmentRoot = ownerHost.attachmentRoot;
  if (
    attachmentRoot !== undefined &&
    (!isAbsolute(attachmentRoot) ||
      attachmentRoot === cwd ||
      attachmentRoot === "/" ||
      attachmentRoot.startsWith(`${cwd}${sep}`) ||
      cwd.startsWith(`${attachmentRoot}${sep}`) ||
      realpathSync(attachmentRoot) !== attachmentRoot ||
      !statSync(attachmentRoot).isDirectory())
  )
    throw new Error("codex_owner_host_attachment_root_invalid");

  // PATH начинает текущая закреплённая пара Node/npm. Login shell выключен,
  // чтобы profile/rc не восстановил credentials или другой runtime поверх allowlist.
  return {
    HOME: owner.homedir,
    USER: owner.username,
    LOGNAME: owner.username,
    SHELL: owner.shell,
    PATH: [
      ...new Set([
        dirname(process.execPath),
        join(owner.homedir, ".local", "bin"),
        "/usr/local/bin",
        "/usr/bin",
        "/bin",
      ]),
    ].join(":"),
  };
}
