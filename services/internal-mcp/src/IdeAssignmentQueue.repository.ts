/**
 * @file services/internal-mcp/src/IdeAssignmentQueue.repository.ts
 * @version 1.3.0
 * @date 2026-11-27
 * @description Хранит заявки IDE и выдаёт read-only назначения локальному оркестратору.
 * @see documentation/specifications/internal-mcp.md
 */
import { createHash, randomUUID } from "node:crypto";
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

/** Точные включительные границы и SHA-256 фрагмента UTF-8 в stdin исполнителя. */
export type IdeAuditRange = {
  path: string;
  startLine: number;
  endLine: number;
  totalLines: number;
  byteLength: number;
  fileSha256: string;
  rangeSha256: string;
};

export type IdeAuditDelivery = {
  assignmentId: string;
  ranges: IdeAuditRange[];
};

export type PriorAuditMaterial = {
  attempt: string;
  assessment: string;
  deliveries: IdeAuditDelivery[];
  reports: {
    assignmentId: string;
    report: string;
    request: string | null;
    phase: string;
  }[];
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
      );
      CREATE TABLE IF NOT EXISTS audit_deliveries (
        runId TEXT NOT NULL, attempt TEXT NOT NULL, assignmentId TEXT NOT NULL, ranges TEXT NOT NULL,
        PRIMARY KEY (runId, attempt, assignmentId)
      );
      CREATE TABLE IF NOT EXISTS audit_search_steps (runId TEXT NOT NULL, attempt TEXT NOT NULL, step INTEGER NOT NULL, evidence TEXT NOT NULL, PRIMARY KEY(runId,attempt,step));`);
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

  /** Публикация всех диапазонов пакета атомарна и разрешена только владельцу живой аренды. */
  recordDelivery(runId: string, token: string, delivery: IdeAuditDelivery) {
    const attempt = createHash("sha256").update(token).digest("hex");
    const write = this.db.prepare(`
      INSERT INTO audit_deliveries(runId,attempt,assignmentId,ranges)
      SELECT runId,?,?,? FROM runs
      WHERE root=? AND runId=? AND token=? AND status='running' AND expires>=?
      ON CONFLICT(runId,attempt,assignmentId) DO UPDATE SET ranges=excluded.ranges
      WHERE ranges=excluded.ranges`);
    if (
      !write.run(
        attempt,
        delivery.assignmentId,
        JSON.stringify(delivery.ranges),
        this.root,
        runId,
        token,
        Date.now(),
      ).changes
    )
      throw new Error("assignment_delivery_conflict");
  }

  /** Поисковая итерация принадлежит той же живой попытке, что и квитанции выдачи. */
  recordSearchStep(
    runId: string,
    token: string,
    step: number,
    evidence: unknown,
  ) {
    const attempt = createHash("sha256").update(token).digest("hex");
    if (
      !this.db
        .prepare(
          `INSERT INTO audit_search_steps SELECT runId,?,?,? FROM runs
        WHERE root=? AND runId=? AND token=? AND status='running' AND expires>=?`,
        )
        .run(
          attempt,
          step,
          JSON.stringify(evidence),
          this.root,
          runId,
          token,
          Date.now(),
        ).changes
    )
      throw new Error("assignment_search_lease_conflict");
  }

  /** Предыдущая попытка того же runId не добавляет покрытие новой выдаче. */
  readDeliveries(runId: string, token: string): IdeAuditDelivery[] {
    const attempt = createHash("sha256").update(token).digest("hex");
    return this.db
      .prepare(
        `
      SELECT assignmentId,ranges FROM audit_deliveries JOIN runs USING(runId)
      WHERE root=? AND runId=? AND token=? AND attempt=?`,
      )
      .all(this.root, runId, token, attempt)
      .map((row) => ({
        assignmentId: String(row.assignmentId),
        ranges: JSON.parse(String(row.ranges)),
      }));
  }

  /** После смены аренды предыдущая приёмка может предложить пути для новой независимой проверки. */
  priorSearchPaths(runId: string, token: string): string[] {
    const attempt = createHash("sha256").update(token).digest("hex");
    const row = this.db
      .prepare(
        `SELECT s.evidence FROM audit_search_steps s JOIN runs r USING(runId)
      WHERE r.root=? AND r.runId=? AND r.token=? AND r.status='running' AND r.expires>=?
        AND s.attempt<>? AND json_extract(s.evidence,'$.phase')='assessment'
      ORDER BY s.rowid DESC LIMIT 1`,
      )
      .get(this.root, runId, token, Date.now(), attempt);
    if (!row) return [];
    const data: Record<string, unknown> = JSON.parse(String(row.evidence));
    const paths = new Set<string>();
    for (const [field, property] of [
      ["areas", "path"],
      ["objectives", "path"],
      ["consumers", "source"],
    ]) {
      const items = data[field];
      if (Array.isArray(items))
        for (const item of items)
          if (typeof item?.[property] === "string" && item[property])
            paths.add(item[property]);
    }
    return [...paths];
  }

  /** Архив выдачи для повторной проверки снимков. Чтение принадлежит владельцу новой аренды того же run. */
  priorAuditMaterial(
    runId: string,
    token: string,
  ): PriorAuditMaterial | undefined {
    const owner = createHash("sha256").update(token).digest("hex");
    const latest = this.db
      .prepare(
        `SELECT s.attempt,s.step,s.evidence FROM audit_search_steps s JOIN runs r USING(runId)
      WHERE r.root=? AND r.runId=? AND r.token=? AND r.status='running' AND r.expires>=?
      AND s.attempt<>? AND json_extract(s.evidence,'$.phase')='assessment'
      ORDER BY s.rowid DESC LIMIT 1`,
      )
      .get(this.root, runId, token, Date.now(), owner);
    if (!latest) return;
    const attempt = String(latest.attempt);
    const reports = this.db
      .prepare(
        `SELECT json_extract(evidence,'$.assignmentId') id,json_extract(evidence,'$.report') report,json_extract(evidence,'$.request') request,json_extract(evidence,'$.phase') phase
      FROM audit_search_steps WHERE runId=? AND attempt=? AND step<=? AND json_extract(evidence,'$.phase') IN ('source-review','passage-review') AND json_extract(evidence,'$.status')='completed' ORDER BY step`,
      )
      .all(runId, attempt, latest.step)
      .map((row) => ({
        assignmentId: String(row.id),
        report: String(row.report),
        request: row.request === null ? null : String(row.request),
        phase: String(row.phase),
      }));
    if (!reports.length) return;
    const ids = new Set(reports.map((r) => r.assignmentId));
    const deliveries = this.db
      .prepare(
        "SELECT assignmentId,ranges FROM audit_deliveries WHERE runId=? AND attempt=?",
      )
      .all(runId, attempt)
      .filter((row) => ids.has(String(row.assignmentId)))
      .map((row) => ({
        assignmentId: String(row.assignmentId),
        ranges: JSON.parse(String(row.ranges)) as IdeAuditRange[],
      }));
    return {
      attempt,
      assessment: String(latest.evidence),
      reports,
      deliveries,
    };
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
      ORDER BY rowid LIMIT 1) RETURNING runId,lockPath,lockSha256,task,principal,idempotencyKey`,
      )
      .get(token, now + 30 * 60_000, this.root, Number(includeText), now);
    return row
      ? {
          runId: String(row.runId),
          lockPath: String(row.lockPath),
          lockSha256: String(row.lockSha256),
          task: typeof row.task === "string" ? row.task : undefined,
          ...(typeof row.task === "string"
            ? {
                grantKey: createHash("sha256")
                  .update(
                    JSON.stringify([
                      this.root,
                      row.principal,
                      row.idempotencyKey,
                    ]),
                  )
                  .digest("hex"),
              }
            : {}),
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
