/**
 * @file packages/git-runtime/src/acquireGitLock.adapter.ts
 * @version 1.0.1
 * @date 2026-10-22
 * @description Удерживает процессную блокировку общего каталога Git через flock.
 */
import { spawn } from "node:child_process";
import { constants, fstatSync, statSync } from "node:fs";
import { open, realpath } from "node:fs/promises";
import { PolicyError } from "./Policy.error.ts";
import type { GitLock } from "./GitLock.types.ts";

const issuedLeases = new WeakSet<object>();

/** Общий executor принимает только живой lease, выданный этим owner. */
export function assertGitLockHeld(lease: GitLock): void {
  if (!lease || !issuedLeases.has(lease))
    throw new PolicyError(
      "git_lock_invalid",
      "Блокировка Git не принадлежит общему исполнителю.",
    );
  lease.assertHeld();
}

export async function acquireGitLock(
  commonDirectory: string,
): Promise<GitLock> {
  if (process.platform !== "linux")
    throw new PolicyError(
      "unsupported_platform",
      "Первый этап требует Linux и flock.",
    );
  const canonicalDirectory = await realpath(commonDirectory);
  const directory = await open(
    canonicalDirectory,
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
  const identity = await directory.stat().catch(async (error: unknown) => {
    await directory.close();
    throw error;
  });
  const lease = Object.freeze({
    descriptor: directory.fd,
    commonDirectory: canonicalDirectory,
    assertHeld() {
      if (!alive) {
        throw new PolicyError("lock_lost", "Блокировка операции потеряна.");
      }
      try {
        const current = fstatSync(directory.fd);
        const owner = statSync(canonicalDirectory);
        if (
          current.dev !== identity.dev ||
          current.ino !== identity.ino ||
          owner.dev !== identity.dev ||
          owner.ino !== identity.ino
        )
          throw new Error("lock identity changed");
      } catch {
        throw new PolicyError(
          "lock_lost",
          "Descriptor блокировки операции недоступен.",
        );
      }
    },
    async release() {
      if (!alive) return;
      alive = false;
      await directory.close();
    },
  }) as GitLock;
  issuedLeases.add(lease);
  return lease;
}
