/**
 * @file packages/payload-ai-plugin/src/admin/ReleaseEvidence.tsx
 * @version 2026-08-22
 * @description Показывает OCI evidence и отдельное release approval до production deploy.
 */

"use client";

import type {
  ReleaseApprovalDTO,
  ReleaseCandidateDTO,
} from "@realize/ai-contracts";
import {
  CheckCircle2,
  ChevronDown,
  Container,
  ExternalLink,
  FileKey2,
  Loader2,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { useState } from "react";

import styles from "./PreviewEvidence.module.css";

type ReleaseEvidenceProps = {
  approval?: ReleaseApprovalDTO;
  candidate: ReleaseCandidateDTO;
  onApprove: () => void;
  onReject: (comment: string) => void;
  pending: boolean;
};

const statusLabel: Record<ReleaseCandidateDTO["status"], string> = {
  approved: "Release утверждён",
  blocked: "Release заблокирован",
  building: "Собираем OCI image",
  deploying_preview: "Разворачиваем OCI preview",
  expired: "Release candidate истёк",
  failed: "Release не подготовлен",
  preparing: "Проверяем source artifact",
  queued: "Release в очереди",
  ready: "Release candidate готов",
  rejected: "Release отклонён",
  scanning: "Проверяем supply chain",
  verifying_preview: "Проверяем OCI preview",
};

const activeStatuses = new Set<ReleaseCandidateDTO["status"]>([
  "building",
  "deploying_preview",
  "preparing",
  "queued",
  "scanning",
  "verifying_preview",
]);

/** Отделяет release approval от preview acceptance и production deploy. */
export const ReleaseEvidence = ({
  approval,
  candidate,
  onApprove,
  onReject,
  pending,
}: ReleaseEvidenceProps) => {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const active = activeStatuses.has(candidate.status);
  const canDecide =
    candidate.status === "ready" &&
    candidate.previewStatus === "healthy" &&
    candidate.signatureVerified &&
    !approval;

  return (
    <section className={styles.preview} data-testid="release-evidence">
      <header className={styles.header}>
        <span className={styles.icon} aria-hidden="true">
          {active ? (
            <Loader2 className={styles.spin} size={16} />
          ) : candidate.status === "ready" ||
            candidate.status === "approved" ? (
            <Container size={16} />
          ) : (
            <XCircle size={16} />
          )}
        </span>
        <div>
          <strong>{statusLabel[candidate.status]}</strong>
          <span>
            {active
              ? "Production не изменяется"
              : candidate.errorSummary || candidate.healthSummary}
          </span>
        </div>
        <span className={styles.stage}>{candidate.stage}</span>
      </header>

      <div className={styles.artifactBar}>
        <Container size={14} />
        <span title={candidate.imageRef || candidate.gitCommit}>
          {candidate.imageRef || `commit ${candidate.gitCommit.slice(0, 12)}`}
        </span>
        <code title={candidate.imageDigest || candidate.gitCommit}>
          {(candidate.imageDigest || candidate.gitCommit).slice(0, 18)}…
        </code>
      </div>

      {candidate.previewURL && candidate.previewStatus === "healthy" ? (
        <a
          className={styles.previewLink}
          href={candidate.previewURL}
          rel="noreferrer"
          target="_blank"
        >
          <span>
            <strong>Открыть OCI preview</strong>
            <small>{candidate.previewURL}</small>
          </span>
          <ExternalLink size={15} />
        </a>
      ) : null}

      {candidate.imageDigest ? (
        <details className={styles.details}>
          <summary>
            <span>
              <ShieldCheck size={15} /> Supply-chain evidence
            </span>
            <ChevronDown size={15} />
          </summary>
          <div className={styles.detailsBody}>
            <dl className={styles.hashes}>
              <div>
                <dt>Image</dt>
                <dd title={candidate.imageDigest}>
                  {candidate.imageDigest.slice(0, 28)}…
                </dd>
              </div>
              <div>
                <dt>Manifest</dt>
                <dd title={candidate.manifestHash}>
                  {candidate.manifestHash?.slice(0, 28)}…
                </dd>
              </div>
              <div>
                <dt>SBOM</dt>
                <dd title={candidate.sbomDigest}>
                  {candidate.sbomDigest?.slice(0, 28)}…
                </dd>
              </div>
              <div>
                <dt>Migrations</dt>
                <dd title={candidate.migrationSetHash}>
                  {candidate.migrationSetHash?.slice(0, 28)}…
                </dd>
              </div>
              <div>
                <dt>Evidence</dt>
                <dd title={candidate.evidenceHash}>
                  {candidate.evidenceHash?.slice(0, 28)}…
                </dd>
              </div>
            </dl>

            <div className={styles.review}>
              <div>
                <strong>OCI signature</strong>
                <span
                  className={
                    candidate.signatureVerified
                      ? styles.reviewApproved
                      : styles.reviewRejected
                  }
                >
                  {candidate.signatureVerified ? "verified" : "unverified"}
                </span>
              </div>
              <p>{candidate.signatureRef || "Signature ref отсутствует."}</p>
              {candidate.provenanceRef ? (
                <small>Provenance: {candidate.provenanceRef}</small>
              ) : null}
            </div>

            <div>
              <h4>Runtime manifest</h4>
              <ul className={styles.checks}>
                <li>
                  <FileKey2 size={14} />
                  <div>
                    <code>config</code>
                    <span>{candidate.configVersion || "не указан"}</span>
                  </div>
                </li>
                {Object.entries(candidate.pluginVersions).map(
                  ([name, version]) => (
                    <li key={name}>
                      <FileKey2 size={14} />
                      <div>
                        <code>{name}</code>
                        <span>{version}</span>
                      </div>
                    </li>
                  ),
                )}
              </ul>
            </div>

            <div>
              <h4>Forward migrations · {candidate.migrations.length}</h4>
              <ul className={styles.checks}>
                {candidate.migrations.length ? (
                  candidate.migrations.map((migration) => (
                    <li key={migration.id}>
                      <FileKey2 size={14} />
                      <div>
                        <code>{migration.id}</code>
                        <span>{migration.checksum.slice(0, 20)}…</span>
                      </div>
                    </li>
                  ))
                ) : (
                  <li>
                    <CheckCircle2 size={14} />
                    <div>
                      <span>Новых migrations нет.</span>
                    </div>
                  </li>
                )}
              </ul>
            </div>
          </div>
        </details>
      ) : null}

      <div className={styles.expiry}>
        Release candidate действует до{" "}
        {new Date(candidate.expiresAt).toLocaleString("ru-RU")}.
      </div>

      {approval ? (
        <div
          className={`${styles.acceptance} ${
            approval.decision === "rejected" ? styles.rejected : ""
          }`}
        >
          {approval.decision === "approved" ? (
            <CheckCircle2 size={15} />
          ) : (
            <XCircle size={15} />
          )}
          Release {approval.decision === "approved" ? "утверждён" : "отклонён"}{" "}
          ролью {approval.actorRole}. Production deploy не запускался.
        </div>
      ) : null}

      {canDecide ? (
        rejecting ? (
          <div className={styles.rejectForm}>
            <label>
              Почему release нельзя утверждать
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
                Отклонить release
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
              Отклонить release
            </button>
            <button disabled={pending} onClick={onApprove} type="button">
              <CheckCircle2 size={15} />
              {pending ? "Сохраняем…" : "Утвердить exact digest"}
            </button>
          </div>
        )
      ) : null}
    </section>
  );
};
