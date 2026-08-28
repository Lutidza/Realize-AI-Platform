/**
 * @file packages/payload-ai-plugin/src/admin/DataOperationCard.tsx
 * @version 2026-08-28
 * @description Показывает DataOperation dry-run, approval, apply и rollback gates.
 * @docref Realize AI Commerce v1.0 — Data/Config Pipeline
 * @see documentation/specifications/realize-ai-commerce/v1.0/02-change-engine-and-pipelines/14-data-config-pipeline.md
 */

"use client";

import type { DataOperationDTO } from "@realize/ai-contracts";
import { Check, Clock3, Database, Play, RotateCcw, X } from "lucide-react";
import { useState } from "react";

import styles from "./ChangeRequestCard.module.css";
import { DataOperationPreview } from "./DataOperationPreview";

type DataOperationCardProps = {
  onApply: () => void;
  onApprove: () => void;
  onApproveRollback: () => void;
  onReject: (comment: string) => void;
  onRollback: () => void;
  operation: DataOperationDTO;
  pending: boolean;
};

const stateLabel = (state: DataOperationDTO["state"]): string => {
  switch (state) {
    case "awaiting_approval":
      return "Ожидает подтверждения";
    case "approved":
      return "Подтверждено";
    case "rejected":
      return "Отклонено";
    case "applied":
      return "Применено";
    case "apply_failed":
      return "Не применено";
    case "rollback_approved":
      return "Откат подтверждён";
    case "rolled_back":
      return "Откат выполнен";
    default:
      return "Откат не выполнен";
  }
};

const stateTone = (state: DataOperationDTO["state"]): string => {
  if (["rejected", "apply_failed", "rollback_failed"].includes(state)) {
    return styles.state_blocked;
  }
  if (state === "awaiting_approval") return styles.state_execution_queued;
  return styles.state_plan_approved;
};

/** Renders the first typed Data Lane without exposing generic mutation input. */
export const DataOperationCard = ({
  onApply,
  onApprove,
  onApproveRollback,
  onReject,
  onRollback,
  operation,
  pending,
}: DataOperationCardProps) => {
  const [rejecting, setRejecting] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [approvalNow] = useState(() => Date.now());
  const expired = Date.parse(operation.expiresAt) <= approvalNow;

  return (
    <section className={styles.card} data-testid="data-operation-card">
      <header className={styles.header}>
        <span className={styles.icon} aria-hidden="true">
          <Database size={17} />
        </span>
        <div>
          <span>Payload Data Operation · v{operation.version}</span>
          <strong>{operation.title}</strong>
        </div>
        <span className={`${styles.state} ${stateTone(operation.state)}`}>
          {stateLabel(operation.state)}
        </span>
      </header>

      <div className={styles.summaryGrid}>
        <div>
          <span>Операция</span>
          <strong>Назначить категорию</strong>
        </div>
        <div>
          <span>Риск</span>
          <strong>{operation.riskLevel}</strong>
        </div>
        <div>
          <span>Документы</span>
          <strong>{operation.estimatedCount}</strong>
        </div>
        <div>
          <span>Откат</span>
          <strong>Before snapshot</strong>
        </div>
      </div>

      <DataOperationPreview operation={operation} />

      {operation.state === "awaiting_approval" ? (
        <div className={styles.expiry}>
          <Clock3 size={14} />
          {expired
            ? "Срок dry-run истёк"
            : `Действует до ${new Date(operation.expiresAt).toLocaleString("ru-RU")}`}
        </div>
      ) : null}

      {operation.approval ? (
        <div
          className={`${styles.decision} ${
            operation.approval.decision === "rejected"
              ? styles.decisionRejected
              : ""
          }`}
        >
          {operation.approval.decision === "approved" ? (
            <Check size={16} />
          ) : (
            <X size={16} />
          )}
          <span>
            Write{" "}
            {operation.approval.decision === "approved"
              ? "подтверждён"
              : "отклонён"}
            {` ролью ${operation.approval.actorRole}.`}
          </span>
        </div>
      ) : null}

      {operation.rollbackApproval ? (
        <div className={styles.decision}>
          <RotateCcw size={16} />
          <span>
            Rollback hash подтверждён ролью{" "}
            {operation.rollbackApproval.actorRole}.
          </span>
        </div>
      ) : null}

      {operation.state === "approved" ? (
        <div className={styles.executeAction}>
          <div>
            <strong>Применить через Payload Local API</strong>
            <span>
              Access, optimistic lock, hooks, audit и outbox выполнятся в одной
              транзакции.
            </span>
          </div>
          <button disabled={pending} onClick={onApply} type="button">
            <Play size={15} fill="currentColor" />
            {pending ? "Применяем…" : "Шаг 3 · Применить"}
          </button>
        </div>
      ) : null}

      {operation.state === "applied" ? (
        <div className={styles.executeAction}>
          <div>
            <strong>Подготовлен compensating rollback</strong>
            <span>
              Откат восстановит exact before-snapshot, если товар не менялся
              после apply.
            </span>
          </div>
          <button disabled={pending} onClick={onApproveRollback} type="button">
            <RotateCcw size={15} />
            {pending ? "Подтверждаем…" : "Подтвердить откат"}
          </button>
        </div>
      ) : null}

      {operation.state === "rollback_approved" ? (
        <div className={styles.executeAction}>
          <div>
            <strong>Rollback разрешён</strong>
            <span>
              Перед записью Payload повторно проверит applied version товара.
            </span>
          </div>
          <button disabled={pending} onClick={onRollback} type="button">
            <RotateCcw size={15} />
            {pending ? "Откатываем…" : "Выполнить откат"}
          </button>
        </div>
      ) : null}

      {operation.errorSummary ? (
        <p className={styles.blockedReason}>{operation.errorSummary}</p>
      ) : null}

      {operation.state === "awaiting_approval" && !expired ? (
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
              {pending
                ? "Сохраняем…"
                : `Шаг 2 · Подтвердить v${operation.version}`}
            </button>
          </div>
        )
      ) : null}
    </section>
  );
};
