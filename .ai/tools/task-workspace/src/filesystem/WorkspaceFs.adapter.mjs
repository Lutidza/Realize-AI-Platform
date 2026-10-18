/**
 * @file .ai/tools/task-workspace/src/filesystem/WorkspaceFs.adapter.mjs
 * @version 1.0.2
 * @date 2026-10-15
 * @description Закрепляет файловые операции дескрипторами каталогов и исключает обход ссылок и перезапись при переносе.
 * @see documentation/specifications/task-management-execution.md
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fail } from "../Workspace.error.mjs";
import { safeRelative } from "./safeRelative.validator.mjs";
const DIRECTORY =
  fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW;
/** @param {number} fd */
const fdPath = (fd) => `/proc/self/fd/${fd}`;
/** Дескрипторы Linux удерживают проверенные каталоги при замене пути; конечная ссылка не открывается. */
export class WorkspaceFs {
  /** @param {string} root Корень, к которому привязаны все относительные операции. */
  constructor(root) {
    if (process.platform !== "linux")
      fail(
        "filesystem_capability_required",
        "Файловый адаптер требует Linux /proc и GNU mv.",
      );
    this.root = fs.realpathSync(root);
    this.rootFd = fs.openSync(this.root, DIRECTORY);
  }
  /** Закрывает корневой дескриптор после завершения всех синхронных операций. */
  close() {
    fs.closeSync(this.rootFd);
  }
  /**
   * Передаёт закреплённый родительский каталог только на время синхронного вызова.
   * @template TResult
   * @param {string} relative
   * @param {boolean} create Создавать отсутствующих родителей с режимом 0700.
   * @param {(path: string, parentFd: number, name: string) => TResult} callback
   * @returns {TResult}
   */
  withParent(relative, create, callback) {
    const parts = safeRelative(relative).split("/");
    const name = /** @type {string} */ (parts.pop());
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
            if (/** @type {NodeJS.ErrnoException} */ (e).code !== "EEXIST")
              throw e;
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
      const code = /** @type {NodeJS.ErrnoException} */ (e).code;
      if (code === "ELOOP" || code === "ENOTDIR") fail("symlink_parent");
      throw e;
    } finally {
      for (const handle of opened.reverse()) fs.closeSync(handle);
    }
  }
  /** @param {string} relative */
  stat(relative) {
    return this.withParent(relative, false, (p) =>
      fs.lstatSync(p, { bigint: true }),
    );
  }
  /** @param {string} relative */
  exists(relative) {
    try {
      this.stat(relative);
      return true;
    } catch (e) {
      if (/** @type {NodeJS.ErrnoException} */ (e).code === "ENOENT")
        return false;
      throw e;
    }
  }
  /** @param {string} relative */
  mkdir(relative) {
    return this.withParent(relative, true, (p, parent) => {
      try {
        fs.mkdirSync(p, { mode: 0o700 });
        fs.fsyncSync(parent);
      } catch (e) {
        if (/** @type {NodeJS.ErrnoException} */ (e).code !== "EEXIST") throw e;
        const s = fs.lstatSync(p);
        if (!s.isDirectory() || s.isSymbolicLink()) fail("unsafe_directory");
      }
    });
  }
  /**
   * Читает только обычный файл, не следуя конечной ссылке.
   * @param {string} relative
   * @param {number} maxBytes
   */
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
  /**
   * Разбирает JSON; предметная проверка полученного значения принадлежит потребителю.
   * @param {string} relative
   * @param {number} maxBytes
   * @returns {unknown}
   */
  json(relative, maxBytes = 32 * 1024 * 1024) {
    try {
      return JSON.parse(this.read(relative, maxBytes).toString("utf8"));
    } catch (e) {
      if (e instanceof SyntaxError) fail("invalid_json");
      throw e;
    }
  }
  /**
   * Записывает файл с fsync; exclusive запрещает замену существующего пути.
   * @param {string} relative
   * @param {string | Buffer} value
   * @param {boolean} exclusive
   */
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
      /** @type {number | undefined} */
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
        fs.rmSync(temporary, { force: true });
      }
    });
  }
  /**
   * @param {string} relative
   * @param {unknown} value
   * @param {boolean} exclusive
   */
  writeJson(relative, value, exclusive = false) {
    this.write(relative, JSON.stringify(value, null, 2) + "\n", exclusive);
  }
  /** @param {string} relative */
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
  /** @param {string} relative */
  unlink(relative) {
    this.withParent(relative, false, (p, parent) => {
      fs.unlinkSync(p);
      fs.fsyncSync(parent);
    });
  }
  /**
   * GNU mv запрещает перезапись и замену rename копированием; FD3/4 закрепляют родителей.
   * @param {string} source
   * @param {string} destination
   */
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
