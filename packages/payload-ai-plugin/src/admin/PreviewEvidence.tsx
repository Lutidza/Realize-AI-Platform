/**
 * @file packages/payload-ai-plugin/src/admin/PreviewEvidence.tsx
 * @owner packages/payload-ai-plugin
 * @purpose Renders promotion progress, independent review and preview acceptance.
 */

"use client";

import type {
  PreviewAcceptanceDTO,
  PreviewDeploymentDTO,
} from "@realize/ai-contracts";
import {
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  GitCommitHorizontal,
  Loader2,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { useState } from "react";

import styles from "./PreviewEvidence.module.css";

type PreviewEvidenceProps = {
  acceptance?: PreviewAcceptanceDTO;
  deployment: PreviewDeploymentDTO;
  onAccept: () => void;
  onReject: (comment: string) => void;
  pending: boolean;
};

const statusLabel: Record<PreviewDeploymentDTO["status"], string> = {
  accepted: "Preview принят",
  blocked: "Promotion заблокирована",
  cancelled: "Promotion отменена",
  committing: "Создаём commit",
  expired: "Preview истёк",
  failed: "Preview не создан",
  preparing_workspace: "Применяем принятый diff",
  queued: "Promotion в очереди",
  ready: "Preview готов",
  rejected: "Preview отклонён",
  reviewing: "Независимый review",
  running_checks: "Повторные проверки",
  starting_preview: "Запускаем окружение",
};

const activeStatuses = new Set<PreviewDeploymentDTO["status"]>([
  "committing",
  "preparing_workspace",
  "queued",
  "reviewing",
  "running_checks",
  "starting_preview",
]);

/** Keeps preview evidence and its human decision separate from diff acceptance. */
export const PreviewEvidence = ({
  acceptance,
  deployment,
  onAccept,
  onReject,
  pending,
}: PreviewEvidenceProps) => {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const active = activeStatuses.has(deployment.status);
  const canDecide =
    deployment.status === "ready" &&
    deployment.runtimeState === "active" &&
    !acceptance;

  return (
    <section className={styles.preview} data-testid="preview-evidence">
      <header className={styles.header}>
        <span className={styles.icon} aria-hidden="true">
          {active ? (
            <Loader2 className={styles.spin} size={16} />
          ) : deployment.status === "ready" ||
            deployment.status === "accepted" ? (
            <CheckCircle2 size={16} />
          ) : (
            <XCircle size={16} />
          )}
        </span>
        <div>
          <strong>{statusLabel[deployment.status]}</strong>
          <span>
            {active
              ? "Production и основной checkout не изменяются"
              : deployment.errorSummary || deployment.healthSummary}
          </span>
        </div>
        <span className={styles.stage}>{deployment.stage}</span>
      </header>

      <div className={styles.artifactBar}>
        <GitCommitHorizontal size={14} />
        <span title={deployment.branch}>{deployment.branch}</span>
        <code title={deployment.commitSHA || deployment.baseCommit}>
          {(deployment.commitSHA || deployment.baseCommit).slice(0, 12)}
        </code>
      </div>

      {deployment.previewURL && deployment.runtimeState === "active" ? (
        <a
          className={styles.previewLink}
          href={deployment.previewURL}
          rel="noreferrer"
          target="_blank"
        >
          <span>
            <strong>Открыть local preview</strong>
            <small>{deployment.previewURL}</small>
          </span>
          <ExternalLink size={15} />
        </a>
      ) : null}

      {deployment.artifactHash ||
      deployment.reviewer ||
      deployment.checks.length ? (
        <details className={styles.details}>
          <summary>
            <span>
              <ShieldCheck size={15} /> Review и evidence
            </span>
            <ChevronDown size={15} />
          </summary>
          <div className={styles.detailsBody}>
            {deployment.artifactHash ? (
              <dl className={styles.hashes}>
                <div>
                  <dt>Artifact</dt>
                  <dd title={deployment.artifactHash}>
                    {deployment.artifactHash.slice(0, 20)}…
                  </dd>
                </div>
                <div>
                  <dt>Source diff</dt>
                  <dd title={deployment.sourceDiffHash}>
                    {deployment.sourceDiffHash.slice(0, 20)}…
                  </dd>
                </div>
                {deployment.treeHash ? (
                  <div>
                    <dt>Git tree</dt>
                    <dd title={deployment.treeHash}>
                      {deployment.treeHash.slice(0, 20)}…
                    </dd>
                  </div>
                ) : null}
                {deployment.evidenceHash ? (
                  <div>
                    <dt>Evidence</dt>
                    <dd title={deployment.evidenceHash}>
                      {deployment.evidenceHash.slice(0, 20)}…
                    </dd>
                  </div>
                ) : null}
              </dl>
            ) : null}

            {deployment.reviewer ? (
              <div className={styles.review}>
                <div>
                  <strong>Independent reviewer</strong>
                  <span
                    className={
                      deployment.reviewer.status === "approved"
                        ? styles.reviewApproved
                        : styles.reviewRejected
                    }
                  >
                    {deployment.reviewer.status === "approved"
                      ? "approved"
                      : "changes requested"}
                  </span>
                </div>
                <p>{deployment.reviewer.summary}</p>
                {deployment.reviewer.findings.length ? (
                  <ul>
                    {deployment.reviewer.findings.map((finding, index) => (
                      <li key={`${finding.category}-${finding.path || index}`}>
                        <span>{finding.severity}</span>
                        <div>
                          <strong>{finding.category}</strong>
                          <p>{finding.summary}</p>
                          {finding.path ? <code>{finding.path}</code> : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <small>Blocking findings отсутствуют.</small>
                )}
              </div>
            ) : null}

            {deployment.checks.length ? (
              <div>
                <h4>Promotion checks</h4>
                <ul className={styles.checks}>
                  {deployment.checks.map((check) => (
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
          </div>
        </details>
      ) : null}

      <div className={styles.expiry}>
        Local runtime действует до{" "}
        {new Date(deployment.expiresAt).toLocaleString("ru-RU")}.
      </div>

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
          Preview {acceptance.decision === "approved" ? "принят" : "отклонён"}{" "}
          ролью {acceptance.actorRole}.
        </div>
      ) : null}

      {canDecide ? (
        rejecting ? (
          <div className={styles.rejectForm}>
            <label>
              Почему preview нельзя принимать
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
                Отклонить preview
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
              Отклонить preview
            </button>
            <button disabled={pending} onClick={onAccept} type="button">
              <CheckCircle2 size={15} />
              {pending ? "Сохраняем…" : "Принять artifact и preview"}
            </button>
          </div>
        )
      ) : null}
    </section>
  );
};
