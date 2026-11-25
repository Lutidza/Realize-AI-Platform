/**
 * @file .ai/tools/worker-assignment/test/dossier-preview/previewCluster.mjs
 * @version 1.0.0
 * @date 2026-11-26
 * @description Управляет постоянным приватным кластером PostgreSQL предпросмотра досье.
 * @see documentation/specifications/task-management/execution/article-audit-dossier-preview.md
 * @see documentation/specifications/task-management/execution/article-audit-publication.md
 */
import { execFile } from "node:child_process";
import { appendFile, lstat, mkdir, readFile, realpath } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

export const execute = promisify(execFile);
export const workspace = fileURLToPath(
  new URL("../../../../../.data/audit-dossier-preview", import.meta.url),
);
export const socket = join(workspace, "socket");
const data = join(workspace, "pgdata");
const log = join(workspace, "postgres.log");
export const pgEnvironment = {
  PATH: process.env.PATH,
  LC_ALL: "C",
  TZ: "UTC",
  PGHOST: socket,
  PGPORT: "55439",
  PGDATABASE: "realize_checkpoint_pilot",
  PGUSER: "realize_checkpoint_runner",
};

/** Закрытый каталог и конечный владелец обязательны и при повторном запуске. */
export async function privateDirectory(path) {
  if (path === workspace)
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await mkdir(path, { mode: 0o700 }).catch((e) => {
    if (e.code !== "EEXIST") throw e;
  });
  const stat = await lstat(path);
  if (
    (await realpath(path)) !== path ||
    !stat.isDirectory() ||
    stat.uid !== process.getuid() ||
    stat.mode & 0o077
  )
    throw new Error("Небезопасный каталог предпросмотра: " + path);
}

export async function startPreviewCluster(action) {
  if (process.getuid() === 0)
    throw new Error("Требуется непривилегированный пользователь.");
  const version = (
    await execute("pg_config", ["--version"], { env: pgEnvironment })
  ).stdout;
  if (!/^PostgreSQL 18\./.test(version))
    throw new Error("Для предпросмотра требуется PostgreSQL 18.");
  const bindir = (
    await execute("pg_config", ["--bindir"], { env: pgEnvironment })
  ).stdout.trim();
  const pg = (name, args) =>
    execute(join(bindir, name), args, { env: pgEnvironment });
  await privateDirectory(socket);
  await privateDirectory(data);
  const clusterVersion = await readFile(join(data, "PG_VERSION"), "utf8").catch(
    (e) => {
      if (e.code === "ENOENT") return null;
      throw e;
    },
  );
  if (clusterVersion === null) {
    if (action === "stop") return;
    await pg("initdb", [
      "-D",
      data,
      "-U",
      pgEnvironment.PGUSER,
      "--encoding=UTF8",
      "--locale=C",
      "--auth-local=trust",
      "--auth-host=reject",
    ]);
    const quotedSocket = socket.replaceAll("'", "''");
    await appendFile(
      join(data, "postgresql.conf"),
      "\nlisten_addresses = ''\nunix_socket_directories = '" +
        quotedSocket +
        "'\nunix_socket_permissions = 0700\nport = 55439\nfsync = on\nsynchronous_commit = on\nshared_buffers = '24MB'\nmax_connections = 32\nmin_wal_size = '32MB'\nmax_wal_size = '128MB'\n",
    );
  } else if (clusterVersion.trim() !== "18")
    throw new Error(
      "Версия сохранённого кластера отличается от PostgreSQL 18.",
    );
  const running = await pg("pg_ctl", ["-D", data, "status"]).then(
    () => true,
    (e) => {
      if (e.code === 3) return false;
      throw e;
    },
  );
  if (running && ["restart", "stop"].includes(action))
    await pg("pg_ctl", ["-D", data, "-m", "fast", "-w", "stop"]);
  if (action === "stop") return;
  if (!running || action === "restart") {
    // Если процесс прервался между initdb и конфигурацией, исходные TCP-настройки нельзя запускать.
    const expected = {
      listen_addresses: "",
      unix_socket_directories: socket,
      unix_socket_permissions: String(0o700),
      port: pgEnvironment.PGPORT,
      fsync: "on",
      synchronous_commit: "on",
    };
    for (const [name, value] of Object.entries(expected)) {
      const checked = await pg("postgres", ["-D", data, "-C", name]);
      if (checked.stdout.trim() !== value)
        throw new Error("Отказ запуска: неверный параметр preview " + name);
    }
    try {
      await pg("pg_ctl", ["-D", data, "-l", log, "-w", "-t", "30", "start"]);
    } catch (cause) {
      const recent = (await readFile(log, "utf8"))
        .trim()
        .split("\n")
        .slice(-7)
        .join("\n");
      throw new Error("Ошибка запуска PostgreSQL: " + recent, { cause });
    }
  }
  // Защищаем создание БД от случайного подключения к постороннему postmaster.
  const query = (sql) =>
    pg("psql", ["-XAt", "-v", "ON_ERROR_STOP=1", "-d", "postgres", "-c", sql]);
  const settings = (
    await query(
      "SELECT current_setting('data_directory'), current_setting('listen_addresses'), current_setting('fsync'), current_setting('synchronous_commit')",
    )
  ).stdout.trim();
  if (settings !== data + "||on|on")
    throw new Error(
      "Кластер не соответствует приватному профилю предпросмотра.",
    );
  const exists = (
    await query(
      "SELECT EXISTS (SELECT FROM pg_database WHERE datname = 'realize_checkpoint_pilot')",
    )
  ).stdout.trim();
  if (exists === "f")
    await pg("createdb", [
      "--maintenance-db=postgres",
      pgEnvironment.PGDATABASE,
    ]);
}
