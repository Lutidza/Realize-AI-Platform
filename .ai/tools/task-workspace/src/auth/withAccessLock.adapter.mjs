/**
 * @file .ai/tools/task-workspace/src/auth/withAccessLock.adapter.mjs
 * @version 1.0.0
 * @date 2026-10-19
 * @description Сериализует refresh и замену одного подключения между процессами через kernel flock.
 * @see documentation/architecture/platform-access.md
 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import {
  accessStateDirectory,
  privateAccessDirectory,
} from "./AccessConfig.repository.mjs";
import { fail } from "../Workspace.error.mjs";

/** Блокировка принадлежит open-file description и освобождается также при аварийном завершении.
 * @template T @param {string} baseUrl @param {()=>Promise<T>} operation @param {string} [directory] @returns {Promise<T>} */
export async function withAccessLock(
  baseUrl,
  operation,
  directory = accessStateDirectory(),
) {
  if (process.platform !== "linux") fail("auth_keyring_unsupported");
  privateAccessDirectory(directory, true);
  const file = path.join(
    directory,
    `${createHash("sha256").update(baseUrl).digest("hex")}.lock`,
  );
  const fd = fs.openSync(
    file,
    fs.constants.O_RDWR | fs.constants.O_CREAT | fs.constants.O_NOFOLLOW,
    0o600,
  );
  try {
    const identity = fs.fstatSync(fd);
    if (
      !identity.isFile() ||
      identity.nlink !== 1 ||
      identity.uid !== process.getuid?.() ||
      identity.mode & 0o077
    )
      fail("auth_lock_unsafe");
    const acquired = await new Promise((resolve) => {
      const child = spawn(
        "/usr/bin/flock",
        ["--exclusive", "--wait", "12", "3"],
        { stdio: ["ignore", "ignore", "ignore", fd] },
      );
      const timer = setTimeout(() => child.kill("SIGKILL"), 14000);
      child.on("error", () => {
        clearTimeout(timer);
        resolve(false);
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        resolve(code === 0);
      });
    });
    if (!acquired)
      fail(
        "auth_connection_busy",
        "Подключение занято другим процессом. Повторите команду после его завершения.",
      );
    const current = fs.lstatSync(file);
    if (current.ino !== identity.ino || current.dev !== identity.dev)
      fail("auth_lock_unsafe");
    return await operation();
  } finally {
    fs.closeSync(fd);
  }
}
