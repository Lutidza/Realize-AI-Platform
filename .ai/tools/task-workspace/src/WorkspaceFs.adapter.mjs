/**
 * @file .ai/tools/task-workspace/src/WorkspaceFs.adapter.mjs
 * @version 1.0.0
 * @date 2026-10-13
 * @description Закрепляет файловые операции дескрипторами каталогов и исключает обход ссылок и overwrite при переносе.
 * @see documentation/specifications/task-management-execution.md
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fail } from "./Workspace.error.mjs";
const DIRECTORY =
  fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW;
const fdPath = (fd) => `/proc/self/fd/${fd}`;
export function safeRelative(value) {
  if (
    typeof value !== "string" ||
    !value ||
    value.length > 2048 ||
    /[\\\x00-\x1f]/.test(value) ||
    path.isAbsolute(value) ||
    value.split("/").some((s) => !s || s === "." || s === "..")
  )
    fail("unsafe_path");
  return value;
}
export function safeTaskKey(value) {
  if (typeof value !== "string" || !/^[a-z0-9][a-z0-9-]{0,127}$/.test(value))
    fail("unsafe_task_key");
  return value;
}
/** Linux FD aliases удерживают проверенные parents даже при замене pathname; final symlink не читается как target. */
export class WorkspaceFs {
  constructor(root) {
    if (process.platform !== "linux")
      fail(
        "filesystem_capability_required",
        "Файловый адаптер требует Linux /proc и GNU mv.",
      );
    this.root = fs.realpathSync(root);
    this.rootFd = fs.openSync(this.root, DIRECTORY);
  }
  close() {
    fs.closeSync(this.rootFd);
  }
  withParent(relative, create, callback) {
    const parts = safeRelative(relative).split("/");
    const name = parts.pop();
    let fd = this.rootFd;
    const opened = [];
    let logical = this.root;
    try {
      for (const part of parts) {
        const next = `${fdPath(fd)}/${part}`;
        if (create) {
          try {
            fs.mkdirSync(next, { mode: 0o700 });
            fs.fsyncSync(fd);
          } catch (e) {
            if (e.code !== "EEXIST") throw e;
          }
        }
        fd = fs.openSync(next, DIRECTORY);
        opened.push(fd);
        logical = path.join(logical, part);
        if (fs.readlinkSync(fdPath(fd)) !== logical)
          fail("directory_identity_changed");
      }
      if (fs.readlinkSync(fdPath(fd)) !== logical)
        fail("directory_identity_changed");
      return callback(`${fdPath(fd)}/${name}`, fd, name);
    } catch (e) {
      if (e.code === "ELOOP" || e.code === "ENOTDIR") fail("symlink_parent");
      throw e;
    } finally {
      for (const handle of opened.reverse()) fs.closeSync(handle);
    }
  }
  stat(relative) {
    return this.withParent(relative, false, (p) =>
      fs.lstatSync(p, { bigint: true }),
    );
  }
  exists(relative) {
    try {
      this.stat(relative);
      return true;
    } catch (e) {
      if (e.code === "ENOENT") return false;
      throw e;
    }
  }
  mkdir(relative) {
    return this.withParent(relative, true, (p, parent) => {
      try {
        fs.mkdirSync(p, { mode: 0o700 });
        fs.fsyncSync(parent);
      } catch (e) {
        if (e.code !== "EEXIST") throw e;
        const s = fs.lstatSync(p);
        if (!s.isDirectory() || s.isSymbolicLink()) fail("unsafe_directory");
      }
    });
  }
  read(relative, maxBytes = 1024 * 1024) {
    return this.withParent(relative, false, (p) => {
      const fd = fs.openSync(
        p,
        fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW,
      );
      try {
        const s = fs.fstatSync(fd);
        if (!s.isFile() || s.size > maxBytes) fail("file_limit");
        return fs.readFileSync(fd);
      } finally {
        fs.closeSync(fd);
      }
    });
  }
  json(relative, maxBytes = 32 * 1024 * 1024) {
    try {
      return JSON.parse(this.read(relative, maxBytes).toString("utf8"));
    } catch (e) {
      if (e instanceof SyntaxError) fail("invalid_json");
      throw e;
    }
  }
  write(relative, value, exclusive = false) {
    const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
    return this.withParent(relative, true, (p, parent, name) => {
      if (exclusive) {
        const fd = fs.openSync(
          p,
          fs.constants.O_WRONLY |
            fs.constants.O_CREAT |
            fs.constants.O_EXCL |
            fs.constants.O_NOFOLLOW,
          0o600,
        );
        try {
          fs.writeFileSync(fd, bytes);
          fs.fsyncSync(fd);
        } finally {
          fs.closeSync(fd);
        }
        fs.fsyncSync(parent);
        return;
      }
      if (this.exists(relative) && !this.stat(relative).isFile())
        fail("unsafe_file");
      const temporary = `${fdPath(parent)}/.${name}.${randomUUID()}.pending`;
      let fd;
      try {
        fd = fs.openSync(
          temporary,
          fs.constants.O_WRONLY |
            fs.constants.O_CREAT |
            fs.constants.O_EXCL |
            fs.constants.O_NOFOLLOW,
          0o600,
        );
        fs.writeFileSync(fd, bytes);
        fs.fsyncSync(fd);
        fs.closeSync(fd);
        fd = undefined;
        fs.renameSync(temporary, p);
        fs.fsyncSync(parent);
      } finally {
        if (fd !== undefined) fs.closeSync(fd);
        try {
          fs.unlinkSync(temporary);
        } catch (e) {
          if (e.code !== "ENOENT") throw e;
        }
      }
    });
  }
  writeJson(relative, value, exclusive = false) {
    this.write(relative, JSON.stringify(value, null, 2) + "\n", exclusive);
  }
  list(relative) {
    return this.withParent(relative, false, (p) => {
      const fd = fs.openSync(p, DIRECTORY);
      try {
        return fs.readdirSync(fdPath(fd)).sort();
      } finally {
        fs.closeSync(fd);
      }
    });
  }
  unlink(relative) {
    this.withParent(relative, false, (p, parent) => {
      fs.unlinkSync(p);
      fs.fsyncSync(parent);
    });
  }
  /** GNU rename refuses overwrite and copy/delete fallback; inherited FD3/4 anchor both parents. */
  renameNoReplace(source, destination) {
    return this.withParent(source, false, (src, sfd, sname) =>
      this.withParent(destination, true, (dest, dfd, dname) => {
        const before = fs.lstatSync(src, { bigint: true });
        const moved = spawnSync(
          "/usr/bin/mv",
          [
            "--no-copy",
            "--update=none-fail",
            "--no-target-directory",
            "--",
            `/proc/self/fd/3/${sname}`,
            `/proc/self/fd/4/${dname}`,
          ],
          {
            stdio: ["ignore", "pipe", "pipe", sfd, dfd],
            encoding: "utf8",
            timeout: 10000,
            maxBuffer: 4096,
          },
        );
        if (moved.error || moved.status !== 0)
          fail(
            "move_refused",
            "Перенос не выполнен: destination занят или операция недоступна.",
          );
        const after = fs.lstatSync(dest, { bigint: true });
        if (
          before.dev !== after.dev ||
          before.ino !== after.ino ||
          this.exists(source)
        )
          fail("move_identity_changed");
        fs.fsyncSync(sfd);
        fs.fsyncSync(dfd);
      }),
    );
  }
}
export { DIRECTORY, fdPath };
