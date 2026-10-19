/**
 * @file .ai/tools/task-workspace/src/auth/AccessRefreshState.repository.mjs
 * @version 1.0.0
 * @date 2026-10-19
 * @description Сохраняет несекретный маркер начатого refresh, блокируя повтор старого secret после crash.
 * @see documentation/architecture/platform-access.md
 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  accessStateDirectory,
  privateAccessDirectory,
} from "./AccessConfig.repository.mjs";
import { fail } from "../Workspace.error.mjs";

/** Все операции выполняются под connection flock; marker не содержит даже metadata credential.
 * @param {string} [directory] */
export function createAccessRefreshState(directory = accessStateDirectory()) {
  /** @param {string} url */
  const file = (url) =>
    path.join(
      directory,
      `${createHash("sha256").update(url).digest("hex")}.refresh-pending`,
    );
  const sync = () => {
    const fd = fs.openSync(
      directory,
      fs.constants.O_RDONLY |
        fs.constants.O_DIRECTORY |
        fs.constants.O_NOFOLLOW,
    );
    try {
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
  };
  return {
    /** @param {string} url */
    pending(url) {
      if (!privateAccessDirectory(directory)) return false;
      try {
        fs.lstatSync(file(url));
        return true;
      } catch (error) {
        if (/** @type {NodeJS.ErrnoException} */ (error).code === "ENOENT")
          return false;
        fail("auth_refresh_state_unavailable");
      }
    },
    /** Durable intent предшествует HTTP, чтобы внезапное завершение не разрешило refresh replay.
     * @param {string} url */
    begin(url) {
      privateAccessDirectory(directory, true);
      const fd = fs.openSync(file(url), "wx", 0o600);
      try {
        fs.writeFileSync(fd, "refresh outcome pending\n");
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
      sync();
    },
    /** @param {string} url */
    finish(url) {
      if (!privateAccessDirectory(directory)) return;
      try {
        fs.unlinkSync(file(url));
      } catch (error) {
        if (/** @type {NodeJS.ErrnoException} */ (error).code !== "ENOENT")
          fail("auth_refresh_state_unavailable");
      }
      sync();
    },
  };
}
