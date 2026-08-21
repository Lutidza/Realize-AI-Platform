/**
 * @file packages/payload-ai-plugin/src/admin/ChangeRequestCard.tsx
 * @version 2026-08-21
 * @description Renders plan, implementation and local-preview approval gates.
 */

"use client";

import type { ChangeRequestDTO } from "@realize/ai-contracts";
import {
  Check,
  ChevronDown,
  Clock3,
  LockKeyhole,
  Play,
  ShieldCheck,
  X,
} from "lucide-react";
import { useState } from "react";

import styles from "./ChangeRequestCard.module.css";
import { ExecutionEvidence } from "./ExecutionEvidence";
import { PreviewEvidence } from "./PreviewEvidence";

type ChangeRequestCardProps = {
  change: ChangeRequestDTO;
  onApprove: () => void;
  onAcceptImplementation: () => void;
  onAcceptPreview: () => void;
  onDeployPreview: () => void;
  onExecute: () => void;
  onReject: (comment: string) => void;
  onRejectImplementation: (comment: string) => void;
  onRejectPreview: (comment: string) => void;
  pending: boolean;
};

const stateLabel = (change: ChangeRequestDTO): string => {
  if (change.preview.acceptance?.decision === "approved")
    return "Preview принят";
  if (change.preview.acceptance?.decision === "rejected")
    return "Preview отклонён";
  if (change.state === "preview_ready") return "Preview готов";
  if (change.state === "preview_starting") return "Запускаем preview";
  if (change.state === "preview_committing") return "Создаём commit";
  if (change.state === "preview_reviewing") return "Independent review";
  if (change.state === "preview_validating") return "Повторные проверки";
  if (change.state === "preview_preparing") return "Готовим promotion";
  if (change.state === "preview_queued") return "Preview в очереди";
  if (change.state === "preview_failed") return "Preview не создан";
  if (change.acceptance?.decision === "approved") return "Результат принят";
  if (change.acceptance?.decision === "rejected") return "Результат отклонён";
  if (change.state === "changes_ready") return "Нужно принять diff";
  if (change.state === "validating") return "Идут проверки";
  if (change.state === "executing") return "Выполняется";
  if (change.state === "workspace_preparing") return "Готовится worktree";
  if (change.state === "execution_queued") return "В очереди";
  if (change.state === "validation_failed") return "Проверки не пройдены";
  if (change.approval?.decision === "approved") return "План утверждён";
  if (change.approval?.decision === "rejected") return "План отклонён";
  return "Ожидает решения";
};

/** Separates plan approval from ordinary conversational confirmation. */
export const ChangeRequestCard = ({
  change,
  onApprove,
  onAcceptImplementation,
  onAcceptPreview,
  onDeployPreview,
  onExecute,
  onReject,
  onRejectImplementation,
  onRejectPreview,
  pending,
}: ChangeRequestCardProps) => {
  const [rejecting, setRejecting] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [approvalNow] = useState(() => Date.now());
  const expired = Date.parse(change.expiresAt) <= approvalNow;
  const awaiting =
    change.state === "awaiting_plan_approval" && !change.approval;

  return (
    <section className={styles.card} data-testid="change-request-card">
      <header className={styles.header}>
        <span className={styles.icon} aria-hidden="true">
          <ShieldCheck size={17} />
        </span>
        <div>
          <span>Change Request · v{change.version}</span>
          <strong>{change.title}</strong>
        </div>
        <span className={`${styles.state} ${styles[`state_${change.state}`]}`}>
          {stateLabel(change)}
        </span>
      </header>

      <div className={styles.summaryGrid}>
        <div>
          <span>Тип</span>
          <strong>{change.type}</strong>
        </div>
        <div>
          <span>Риск</span>
          <strong>{change.riskLevel}</strong>
        </div>
        <div>
          <span>Пути</span>
          <strong>{change.affectedPaths.length}</strong>
        </div>
        <div>
          <span>Проверки</span>
          <strong>{change.checks.length}</strong>
        </div>
      </div>

      <details className={styles.details}>
        <summary>
          <span>Проверить scope и план</span>
          <ChevronDown size={16} />
        </summary>
        <div className={styles.detailsBody}>
          <div>
            <h3>Затронутые пути</h3>
            <ul>
              {change.affectedPaths.map((path) => (
                <li key={path}>
                  <code>{path}</code>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3>Обязательные проверки</h3>
            <ul>
              {change.checks.map((check) => (
                <li key={check}>
                  <code>{check}</code>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3>План ассистента</h3>
            <p>{change.plan}</p>
          </div>
          <dl className={styles.hashes}>
            <div>
              <dt>Plan hash</dt>
              <dd title={change.planHash}>{change.planHash.slice(0, 16)}…</dd>
            </div>
            <div>
              <dt>Scope hash</dt>
              <dd title={change.scopeHash}>{change.scopeHash.slice(0, 16)}…</dd>
            </div>
          </dl>
        </div>
      </details>

      <div className={styles.expiry}>
        <Clock3 size={14} />
        {expired
          ? "Срок утверждения истёк"
          : `Действует до ${new Date(change.expiresAt).toLocaleString("ru-RU")}`}
      </div>

      {change.approval ? (
        <div
          className={`${styles.decision} ${
            change.approval.decision === "rejected"
              ? styles.decisionRejected
              : ""
          }`}
        >
          {change.approval.decision === "approved" ? (
            <Check size={16} />
          ) : (
            <X size={16} />
          )}
          <span>
            {stateLabel(change)} ролью {change.approval.actorRole}.
            {!change.execution.job ? " Выполнение ещё не запускалось." : ""}
          </span>
        </div>
      ) : null}

      {change.execution.job ? (
        <ExecutionEvidence
          acceptance={change.acceptance}
          job={change.execution.job}
          onAccept={onAcceptImplementation}
          onReject={onRejectImplementation}
          pending={pending}
        />
      ) : null}

      {change.preview.deployment ? (
        <PreviewEvidence
          acceptance={change.preview.acceptance}
          deployment={change.preview.deployment}
          onAccept={onAcceptPreview}
          onReject={onRejectPreview}
          pending={pending}
        />
      ) : null}

      {change.preview.enabled ? (
        <div className={styles.executeAction}>
          <div>
            <strong>Проверенный local preview</strong>
            <span>
              Worker повторит hash/scope/checks, проведёт независимый review и
              создаст commit в отдельной ветке.
            </span>
          </div>
          <button disabled={pending} onClick={onDeployPreview} type="button">
            <Play size={15} fill="currentColor" />
            {pending ? "Ставим в очередь…" : "Создать preview"}
          </button>
        </div>
      ) : null}

      {change.state === "plan_approved" && change.execution.enabled ? (
        <div className={styles.executeAction}>
          <div>
            <strong>Изолированный code worker</strong>
            <span>
              Новая ветка и worktree от текущего commit; основной checkout не
              меняется.
            </span>
          </div>
          <button disabled={pending} onClick={onExecute} type="button">
            <Play size={15} fill="currentColor" />
            {pending ? "Ставим в очередь…" : "Запустить изменение"}
          </button>
        </div>
      ) : null}
      {change.blockedReason ? (
        <p className={styles.blockedReason}>{change.blockedReason}</p>
      ) : null}

      {awaiting && !expired ? (
        rejecting ? (
          <div className={styles.rejectForm}>
            <label>
              Причина отклонения
              <textarea
                maxLength={1_000}
                onChange={(event) => setRejectionReason(event.target.value)}
                rows={3}
                value={rejectionReason}
              />
            </label>
            <div>
              <button onClick={() => setRejecting(false)} type="button">
                Отмена
              </button>
              <button
                disabled={pending || rejectionReason.trim().length < 3}
                onClick={() => onReject(rejectionReason.trim())}
                type="button"
              >
                Отклонить с причиной
              </button>
            </div>
          </div>
        ) : (
          <div className={styles.actions}>
            <button
              className={styles.rejectButton}
              disabled={pending}
              onClick={() => setRejecting(true)}
              type="button"
            >
              Отклонить
            </button>
            <button
              className={styles.approveButton}
              disabled={pending}
              onClick={onApprove}
              type="button"
            >
              <Check size={15} />
              {pending ? "Сохраняем…" : `Утвердить план v${change.version}`}
            </button>
          </div>
        )
      ) : null}

      {change.execution.reason ? (
        <footer className={styles.executionNotice}>
          <LockKeyhole size={14} />
          {change.execution.reason}
        </footer>
      ) : null}
      {change.preview.reason ? (
        <footer className={styles.executionNotice}>
          <LockKeyhole size={14} />
          {change.preview.reason}
        </footer>
      ) : null}
    </section>
  );
};
