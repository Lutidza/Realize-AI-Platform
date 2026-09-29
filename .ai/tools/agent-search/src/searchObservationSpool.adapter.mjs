/**
 * @file .ai/tools/agent-search/src/searchObservationSpool.adapter.mjs
 * @version 1.0.0
 * @date 2026-09-27
 * @description Хранит ограниченный локальный буфер измерений для автоматической доставки.
 * @see documentation/architecture/repository-search.md
 */
import { DatabaseSync } from "node:sqlite";
import {
  closeSync,
  constants,
  lstatSync,
  mkdirSync,
  openSync,
  realpathSync,
} from "node:fs";
import path from "node:path";

export const SEARCH_SPOOL_POLICY = Object.freeze({
  capacity: 100,
  eventBytes: 8192,
  databaseBytes: 1048576,
  retentionMs: 7 * 86400000,
});

function openSpool(root, create) {
  const absoluteRoot = path.resolve(root);
  const tool = path.join(absoluteRoot, ".ai/tools/agent-search");
  // Буфер принадлежит конкретному checkout. Ссылки и чужой writable каталог не принимаются.
  if (realpathSync(tool) !== tool) throw new Error("SEARCH_SPOOL_UNSAFE_PATH");
  const directory = path.join(tool, "runtime");
  if (create) {
    try {
      mkdirSync(directory, { mode: 0o700 });
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
  }
  const directoryStat = lstatSync(directory);
  if (
    !directoryStat.isDirectory() ||
    directoryStat.isSymbolicLink() ||
    (directoryStat.mode & 0o077) !== 0 ||
    (process.getuid && directoryStat.uid !== process.getuid())
  )
    throw new Error("SEARCH_SPOOL_UNSAFE_PATH");
  const filename = path.join(directory, "search-observations.sqlite");
  if (create) {
    try {
      closeSync(
        openSync(
          filename,
          constants.O_CREAT |
            constants.O_EXCL |
            constants.O_WRONLY |
            constants.O_NOFOLLOW,
          0o600,
        ),
      );
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
  }
  // SQLite создаёт только известные sidecar-файлы в том же приватном каталоге.
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    let stat;
    try {
      stat = lstatSync(filename + suffix);
    } catch (error) {
      if (suffix && error.code === "ENOENT") continue;
      throw error;
    }
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      stat.nlink !== 1 ||
      (stat.mode & 0o077) !== 0 ||
      (process.getuid && stat.uid !== process.getuid()) ||
      stat.size > SEARCH_SPOOL_POLICY.databaseBytes
    )
      throw new Error("SEARCH_SPOOL_UNSAFE_FILE");
  }
  const database = new DatabaseSync(filename, {
    timeout: 0,
    allowExtension: false,
  });
  try {
    database.exec(
      "PRAGMA busy_timeout=0; PRAGMA trusted_schema=OFF; PRAGMA synchronous=NORMAL; PRAGMA max_page_count=256;",
    );
    if (create)
      database.exec(`
      CREATE TABLE IF NOT EXISTS observations (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id TEXT NOT NULL UNIQUE,
        observed_at INTEGER NOT NULL,
        payload TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS counters (id INTEGER PRIMARY KEY CHECK (id=1), dropped INTEGER NOT NULL);
      INSERT OR IGNORE INTO counters (id, dropped) VALUES (1, 0);
    `);
    return database;
  } catch (error) {
    database.close();
    throw error;
  }
}

/** Только локальная запись; contention или отказ диска не меняют результат поиска. */
export function enqueueSearchObservation(root, event) {
  let database;
  try {
    const serialized = JSON.stringify(event);
    if (Buffer.byteLength(serialized) > SEARCH_SPOOL_POLICY.eventBytes)
      return false;
    database = openSpool(root, true);
    database.exec("BEGIN IMMEDIATE");
    database
      .prepare("DELETE FROM observations WHERE observed_at < ?")
      .run(Date.now() - SEARCH_SPOOL_POLICY.retentionMs);
    database
      .prepare(
        "INSERT OR IGNORE INTO observations (event_id, observed_at, payload) VALUES (?, ?, ?)",
      )
      .run(event.eventID, Date.parse(event.observedAt), serialized);
    const dropped = database
      .prepare(
        "DELETE FROM observations WHERE sequence NOT IN (SELECT sequence FROM observations ORDER BY sequence DESC LIMIT ?)",
      )
      .run(SEARCH_SPOOL_POLICY.capacity).changes;
    if (dropped)
      database
        .prepare("UPDATE counters SET dropped=dropped+? WHERE id=1")
        .run(dropped);
    database.exec("COMMIT");
    return true;
  } catch {
    return false;
  } finally {
    database?.close();
  }
}

/** Consumer получает максимум один batch; содержимое ещё требует проверки публичной schema. */
export function readSearchObservationSpool(root) {
  let database;
  try {
    database = openSpool(root, false);
    database.exec("BEGIN IMMEDIATE");
    database
      .prepare("DELETE FROM observations WHERE observed_at < ?")
      .run(Date.now() - SEARCH_SPOOL_POLICY.retentionMs);
    const rows = database
      .prepare(
        "SELECT event_id AS eventID, payload FROM observations ORDER BY sequence LIMIT ?",
      )
      .all(SEARCH_SPOOL_POLICY.capacity);
    const { dropped } = database
      .prepare("SELECT dropped FROM counters WHERE id=1")
      .get();
    database.exec("COMMIT");
    return { rows, dropped: Number(dropped) };
  } finally {
    database?.close();
  }
}

/** Удаляет только прочитанные immutable eventID после durable подтверждения; повтор безопасен. */
export function acknowledgeSearchObservations(root, eventIDs) {
  if (!eventIDs.length || eventIDs.length > SEARCH_SPOOL_POLICY.capacity)
    return;
  let database;
  try {
    database = openSpool(root, false);
    database.exec("BEGIN IMMEDIATE");
    const remove = database.prepare(
      "DELETE FROM observations WHERE event_id=?",
    );
    for (const eventID of eventIDs) remove.run(eventID);
    database.exec("COMMIT");
  } finally {
    database?.close();
  }
}
