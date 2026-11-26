/**
 * @file services/internal-mcp/src/IdeAssignmentQueue.repository.ts
 * @version 1.0.0
 * @date 2026-11-26
 * @description Хранит заявки IDE и выдаёт read-only назначения локальному оркестратору.
 * @see documentation/specifications/internal-mcp.md
 */
import { randomUUID } from "node:crypto";
import { lstatSync, mkdirSync, realpathSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { McpError } from "./Mcp.error";

export type AssignmentSubmission = {
  task?: string;
  lockPath?: string;
  lockSha256?: string;
  idempotencyKey: string;
};

type Job = AssignmentSubmission & {
  runId: string;
  status: string;
  report: string | null;
};

/** Отдельный каталог владельца вне checkout. Разные checkout получают разные пространства очереди. */
export class IdeAssignmentQueue {
  private readonly db: DatabaseSync;
  constructor(
    directory: string,
    private readonly root: string,
  ) {
    if (!isAbsolute(directory))
      throw new Error("Требуется абсолютный путь очереди.");
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const info = lstatSync(directory);
    const outside = relative(realpathSync(root), realpathSync(directory));
    if (
      !info.isDirectory() ||
      info.uid !== process.getuid?.() ||
      info.mode & 0o077 ||
      !(outside === ".." || outside.startsWith("../"))
    )
      throw new Error(
        "Очередь требует личный каталог владельца вне репозитория.",
      );
    this.db = new DatabaseSync(join(directory, "assignments.sqlite"));
    this.db.exec(`PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS runs (
        runId TEXT PRIMARY KEY, root TEXT NOT NULL, principal TEXT NOT NULL,
        idempotencyKey TEXT NOT NULL, lockPath TEXT NOT NULL, lockSha256 TEXT NOT NULL,
        status TEXT NOT NULL, token TEXT, expires INTEGER, report TEXT,
        UNIQUE(root, principal, idempotencyKey)
      );`);
    if (
      !this.db
        .prepare("PRAGMA table_info(runs)")
        .all()
        .some((column) => column.name === "task")
    ) {
      this.db.exec("ALTER TABLE runs ADD COLUMN task TEXT");
    }
  }
  close() {
    this.db.close();
  }

  submit(principal: string, input: AssignmentSubmission) {
    const { task, lockPath, lockSha256 } = input;
    if (
      task
        ? lockPath !== undefined || lockSha256 !== undefined
        : !lockPath || !lockSha256
    )
      throw new McpError(
        "INVALID_INPUT",
        "Передайте текст поручения либо полную привязку.",
      );
    this.db
      .prepare(
        `INSERT INTO runs(runId,root,principal,idempotencyKey,lockPath,lockSha256,task,status)
      VALUES(?,?,?,?,?,?,?,'queued') ON CONFLICT(root,principal,idempotencyKey) DO NOTHING`,
      )
      .run(
        randomUUID(),
        this.root,
        principal,
        input.idempotencyKey,
        lockPath ?? "",
        lockSha256 ?? "",
        task ?? null,
      );
    const job = this.db
      .prepare(
        "SELECT * FROM runs WHERE root=? AND principal=? AND idempotencyKey=?",
      )
      .get(this.root, principal, input.idempotencyKey) as Job;
    if (
      job.lockPath !== (lockPath ?? "") ||
      job.lockSha256 !== (lockSha256 ?? "") ||
      (job.task ?? null) !== (task ?? null)
    )
      throw new McpError("CONFLICT", "Ключ уже связан с другим назначением.");
    return this.get(principal, job.runId);
  }

  get(principal: string, runId: string) {
    const row = this.db
      .prepare(
        "SELECT runId,status,report FROM runs WHERE root=? AND principal=? AND runId=?",
      )
      .get(this.root, principal, runId);
    if (!row) throw new McpError("NOT_FOUND", "Поручение недоступно.");
    return row;
  }

  /** Повторная выдача после истечения аренды отзывает прежний ключ публикации. */
  claim(includeText = true) {
    const token = randomUUID();
    const now = Date.now();
    const row = this.db
      .prepare(
        `UPDATE runs SET status='running',token=?,expires=? WHERE runId=(
      SELECT runId FROM runs WHERE root=? AND (?=1 OR task IS NULL) AND (status='queued' OR (status='running' AND expires < ?))
      ORDER BY rowid LIMIT 1) RETURNING runId,lockPath,lockSha256,task`,
      )
      .get(token, now + 30 * 60_000, this.root, Number(includeText), now);
    return row
      ? {
          runId: String(row.runId),
          lockPath: String(row.lockPath),
          lockSha256: String(row.lockSha256),
          task: typeof row.task === "string" ? row.task : undefined,
          token,
        }
      : null;
  }

  /** Продлевает только текущую живую попытку перед следующим Assignment. */
  renew(runId: string, token: string) {
    const now = Date.now();
    if (
      !this.db
        .prepare(
          "UPDATE runs SET expires=? WHERE runId=? AND root=? AND token=? AND status='running' AND expires>=?",
        )
        .run(now + 30 * 60_000, runId, this.root, token, now).changes
    )
      throw new McpError("CONFLICT", "Аренда завершена.");
  }

  finish(
    runId: string,
    token: string,
    status: "completed" | "blocked",
    report: string,
  ) {
    if (!report.trim() || Buffer.byteLength(report) > 32768)
      throw new Error("Недопустимый объём отчёта.");
    const updated = this.db
      .prepare(
        `UPDATE runs SET status=?,report=?,expires=NULL
      WHERE root=? AND runId=? AND token=? AND
      ((status='running' AND expires>=?) OR (status=? AND report=?))`,
      )
      .run(status, report, this.root, runId, token, Date.now(), status, report);
    if (!updated.changes)
      throw new McpError("CONFLICT", "Попытка не владеет поручением.");
  }
}
