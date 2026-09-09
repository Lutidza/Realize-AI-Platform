/**
 * @file .ai/tools/git-delivery/src/acquireGitLock.adapter.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Удерживает процессную блокировку общего каталога Git через flock.
 */
import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { open, realpath } from "node:fs/promises";
import { PolicyError } from "./Policy.error.ts";
import type { GitLock } from "./GitLock.types.ts";

export async function acquireGitLock(
  commonDirectory: string,
): Promise<GitLock> {
  if (process.platform !== "linux")
    throw new PolicyError(
      "unsupported_platform",
      "Первый этап требует Linux и flock.",
    );
  const directory = await open(
    await realpath(commonDirectory),
    constants.O_RDONLY | constants.O_DIRECTORY,
  );
  // Блокируется существующий каталог: inspect не создаёт даже отдельный lock-файл.
  let alive = true;
  try {
    await new Promise<void>((resolve, reject) => {
      // flock и родитель разделяют open file description; выход flock не снимает lock.
      const child = spawn(
        "flock",
        ["--exclusive", "--nonblock", "--conflict-exit-code", "73", "3"],
        {
          shell: false,
          stdio: ["ignore", "ignore", "ignore", directory.fd],
        },
      );
      const timer = setTimeout(() => child.kill("SIGKILL"), 5000);
      child.once("error", () => {
        clearTimeout(timer);
        reject(
          new PolicyError("lock_unavailable", "Не удалось запустить flock."),
        );
      });
      child.once("close", (code) => {
        clearTimeout(timer);
        if (code === 0) resolve();
        else
          reject(
            new PolicyError(
              code === 73 ? "repository_locked" : "lock_failed",
              "Репозиторий занят или блокировка недоступна.",
            ),
          );
      });
    });
  } catch (error) {
    await directory.close();
    throw error;
  }
  return {
    descriptor: directory.fd,
    assertHeld() {
      if (!alive) {
        throw new PolicyError("lock_lost", "Блокировка операции потеряна.");
      }
    },
    async release() {
      alive = false;
      await directory.close();
    },
  };
}
