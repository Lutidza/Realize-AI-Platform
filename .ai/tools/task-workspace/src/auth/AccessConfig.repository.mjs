/**
 * @file .ai/tools/task-workspace/src/auth/AccessConfig.repository.mjs
 * @version 1.0.0
 * @date 2026-10-19
 * @description Хранит только выбранный URL в приватном пользовательском каталоге вне проекта.
 * @see documentation/architecture/platform-access.md
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fail } from "../Workspace.error.mjs";
import { normalizeTaskManagerUrl } from "./normalizeTaskManagerUrl.validator.mjs";
import { workspaceRoot } from "../workspacePaths.config.mjs";

/** Стандартный XDG override остаётся вне checkout, в том числе через существующие symlink ancestors.
 * @param {NodeJS.ProcessEnv} [env] */
export function accessStateDirectory(env = process.env) {
  const state =
    env.XDG_STATE_HOME || path.join(os.homedir(), ".local", "state");
  if (!path.isAbsolute(state))
    fail(
      "auth_config_unsafe",
      "XDG_STATE_HOME должен быть абсолютным путём вне checkout.",
    );
  const directory = path.join(state, "realize", "task-workspace-access");
  let ancestor = directory;
  while (!fs.existsSync(ancestor)) {
    const parent = path.dirname(ancestor);
    if (parent === ancestor) fail("auth_config_unsafe");
    ancestor = parent;
  }
  const physical = path.resolve(
    fs.realpathSync(ancestor),
    path.relative(ancestor, directory),
  );
  const relative = path.relative(fs.realpathSync(workspaceRoot), physical);
  if (
    !relative ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== ".." &&
      !path.isAbsolute(relative))
  )
    fail(
      "auth_config_unsafe",
      "Конфигурация подключения и refresh lock должны находиться вне checkout.",
    );
  return directory;
}

/** Отдельный leaf принадлежит текущему пользователю и не допускает symlink/group access.
 * @param {string} directory @param {boolean} [create] */
export function privateAccessDirectory(directory, create = false) {
  if (create) fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  let stat;
  try {
    stat = fs.lstatSync(directory);
  } catch (error) {
    if (
      /** @type {NodeJS.ErrnoException} */ (error).code === "ENOENT" &&
      !create
    )
      return false;
    fail("auth_config_unavailable");
  }
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    stat.uid !== process.getuid?.() ||
    stat.mode & 0o077
  )
    fail(
      "auth_config_unsafe",
      "Каталог подключения должен принадлежать пользователю и иметь права 0700.",
    );
  return true;
}

/** @param {string} [directory] */
export function createAccessConfigRepository(
  directory = accessStateDirectory(),
) {
  const file = path.join(directory, "connection.json");
  return {
    /** Чтение отсутствующего config не создаёт файлов и не обращается к keyring. */
    read() {
      if (!privateAccessDirectory(directory)) return null;
      let fd;
      try {
        fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
        const stat = fs.fstatSync(fd);
        if (
          !stat.isFile() ||
          stat.nlink !== 1 ||
          stat.uid !== process.getuid?.() ||
          stat.mode & 0o077 ||
          stat.size > 8192
        )
          fail("auth_config_unsafe");
        const value = JSON.parse(fs.readFileSync(fd, "utf8"));
        if (
          !value ||
          Object.keys(value).sort().join(",") !== "baseUrl,schemaVersion" ||
          value.schemaVersion !== 1 ||
          typeof value.baseUrl !== "string"
        )
          fail("auth_config_invalid");
        return normalizeTaskManagerUrl(value.baseUrl);
      } catch (error) {
        if (/** @type {NodeJS.ErrnoException} */ (error).code === "ENOENT")
          return null;
        fail(
          "auth_config_invalid",
          "Не удалось прочитать приватную конфигурацию подключения.",
        );
      } finally {
        if (fd !== undefined) fs.closeSync(fd);
      }
    },
    /** @param {string} baseUrl */
    write(baseUrl) {
      baseUrl = normalizeTaskManagerUrl(baseUrl);
      privateAccessDirectory(directory, true);
      const temporary = path.join(directory, `.connection-${randomUUID()}.tmp`);
      let fd;
      try {
        fd = fs.openSync(temporary, "wx", 0o600);
        fs.writeFileSync(
          fd,
          JSON.stringify({ schemaVersion: 1, baseUrl }) + "\n",
        );
        fs.fsyncSync(fd);
        fs.closeSync(fd);
        fd = undefined;
        fs.renameSync(temporary, file);
        const dir = fs.openSync(
          directory,
          fs.constants.O_RDONLY |
            fs.constants.O_DIRECTORY |
            fs.constants.O_NOFOLLOW,
        );
        try {
          fs.fsyncSync(dir);
        } finally {
          fs.closeSync(dir);
        }
      } catch {
        fail(
          "auth_config_unavailable",
          "Не удалось сохранить выбранный адрес подключения.",
        );
      } finally {
        if (fd !== undefined) fs.closeSync(fd);
        try {
          fs.unlinkSync(temporary);
        } catch {
          /* После atomic rename временного файла нет. */
        }
      }
    },
  };
}
