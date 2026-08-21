/**
 * @file packages/payload-ai-plugin/src/admin/ExecutionEvidence.tsx
 * @version 2026-08-21
 * @description Renders isolated job progress, diff/check evidence and acceptance actions.
 */

"use client";

import type {
  ExecutionJobDTO,
  ImplementationAcceptanceDTO,
} from "@realize/ai-contracts";
import {
  CheckCircle2,
  ChevronDown,
  FileDiff,
  GitBranch,
  Loader2,
  XCircle,
} from "lucide-react";
import { useState } from "react";

import styles from "./ExecutionEvidence.module.css";

type ExecutionEvidenceProps = {
  acceptance?: ImplementationAcceptanceDTO;
  job: ExecutionJobDTO;
  onAccept: () => void;
  onReject: (comment: string) => void;
  pending: boolean;
};

const statusLabel: Record<ExecutionJobDTO["status"], string> = {
  blocked: "Заблокировано",
  cancelled: "Отменено",
  completed: "Проверки пройдены",
  failed: "Ошибка",
  preparing_workspace: "Готовим worktree",
  queued: "В очереди",
  running: "Codex выполняет план",
  validating: "Запускаем проверки",
};

const activeStatuses = new Set<ExecutionJobDTO["status"]>([
  "preparing_workspace",
  "queued",
  "running",
  "validating",
]);

/** Keeps execution evidence visually separate from plan approval. */
export const ExecutionEvidence = ({
  acceptance,
  job,
  onAccept,
  onReject,
  pending,
}: ExecutionEvidenceProps) => {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const active = activeStatuses.has(job.status);
  const canDecide = job.status === "completed" && !acceptance;

  return (
    <section className={styles.evidence} data-testid="execution-evidence">
      <header className={styles.header}>
        <span className={styles.icon} aria-hidden="true">
          {active ? (
            <Loader2 className={styles.spin} size={16} />
          ) : job.status === "completed" ? (
            <CheckCircle2 size={16} />
          ) : (
            <XCircle size={16} />
          )}
        </span>
        <div>
          <strong>{statusLabel[job.status]}</strong>
          <span>
            {active ? "Основной checkout не изменяется" : job.errorSummary}
          </span>
        </div>
        <span className={styles.status}>{job.stage}</span>
      </header>

      <div className={styles.gitMeta}>
        <GitBranch size={14} />
        <span title={job.branch}>{job.branch}</span>
        <code title={job.baseCommit}>{job.baseCommit.slice(0, 12)}</code>
      </div>

      {job.workerSummary ? (
        <p className={styles.summary}>{job.workerSummary}</p>
      ) : null}

      {job.changedPaths.length || job.checks.length || job.diff ? (
        <details className={styles.details}>
          <summary>
            <span>
              <FileDiff size={15} /> Diff и evidence
            </span>
            <ChevronDown size={15} />
          </summary>
          <div className={styles.detailsBody}>
            {job.diffHash ? (
              <dl className={styles.hashes}>
                <div>
                  <dt>Diff hash</dt>
                  <dd title={job.diffHash}>{job.diffHash.slice(0, 20)}…</dd>
                </div>
                {job.evidenceHash ? (
                  <div>
                    <dt>Evidence hash</dt>
                    <dd title={job.evidenceHash}>
                      {job.evidenceHash.slice(0, 20)}…
                    </dd>
                  </div>
                ) : null}
              </dl>
            ) : null}
            {job.diffStat.length ? (
              <div>
                <h4>Изменённые файлы</h4>
                <ul className={styles.files}>
                  {job.diffStat.map((file) => (
                    <li key={file.path}>
                      <code>{file.path}</code>
                      <span>
                        <b>+{file.additions ?? "—"}</b>
                        <i>−{file.deletions ?? "—"}</i>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {job.checks.length ? (
              <div>
                <h4>Проверки</h4>
                <ul className={styles.checks}>
                  {job.checks.map((check) => (
                    <li key={check.id}>
                      {check.status === "passed" ? (
                        <CheckCircle2 size={14} />
                      ) : (
                        <XCircle size={14} />
                      )}
                      <div>
                        <code>{check.command}</code>
                        <span>
                          {Math.max(1, Math.round(check.durationMs / 1_000))}{" "}
                          сек.
                        </span>
                        {check.outputSummary ? (
                          <pre>{check.outputSummary}</pre>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {job.diff ? (
              <div>
                <h4>Unified diff{job.diffTruncated ? " · сокращён" : ""}</h4>
                <pre className={styles.diff}>{job.diff}</pre>
              </div>
            ) : null}
          </div>
        </details>
      ) : null}

      {acceptance ? (
        <div
          className={`${styles.acceptance} ${
            acceptance.decision === "rejected" ? styles.rejected : ""
          }`}
        >
          {acceptance.decision === "approved" ? (
            <CheckCircle2 size={15} />
          ) : (
            <XCircle size={15} />
          )}
          Результат {acceptance.decision === "approved" ? "принят" : "отклонён"}{" "}
          ролью {acceptance.actorRole}.
        </div>
      ) : null}

      {canDecide ? (
        rejecting ? (
          <div className={styles.rejectForm}>
            <label>
              Почему результат нельзя принимать
              <textarea
                maxLength={1_000}
                onChange={(event) => setReason(event.target.value)}
                rows={3}
                value={reason}
              />
            </label>
            <div>
              <button onClick={() => setRejecting(false)} type="button">
                Отмена
              </button>
              <button
                disabled={pending || reason.trim().length < 3}
                onClick={() => onReject(reason.trim())}
                type="button"
              >
                Отклонить diff
              </button>
            </div>
          </div>
        ) : (
          <div className={styles.actions}>
            <button
              disabled={pending}
              onClick={() => setRejecting(true)}
              type="button"
            >
              Отклонить результат
            </button>
            <button disabled={pending} onClick={onAccept} type="button">
              <CheckCircle2 size={15} />
              {pending ? "Сохраняем…" : "Принять diff и evidence"}
            </button>
          </div>
        )
      ) : null}
    </section>
  );
};
