/**
 * @file packages/payload-ai-plugin/src/admin/DataOperationCard.tsx
 * @version 1.2.0
 * @date 2026-09-12
 * @description Показывает подтверждение, результат и безопасный откат изменений данных.
 * @docref Realize AI Commerce v1.0 — Data/Config Pipeline
 * @see documentation/specifications/realize-ai-commerce/v1.0/02-change-engine-and-pipelines/14-data-config-pipeline.md
 */

"use client";

import type { DataOperationDTO } from "@realize/ai-contracts";
import { getUiButtonClassName } from "@realize/ui-kit";
import {
  Check,
  Clock3,
  Database,
  FileText,
  Play,
  RotateCcw,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";

import styles from "./ChangeRequestCard.module.css";
import { DataOperationPreview } from "./DataOperationPreview";
import { dataOperationPresentation } from "./dataOperationPresentation.util";
import type { DataOperationCardProps } from "./DataOperationCard.types";

const stateLabel = (
  state: DataOperationDTO["state"],
  labels: ReturnType<typeof dataOperationPresentation>,
): string => {
  switch (state) {
    case "awaiting_approval":
      return "Ожидает подтверждения";
    case "approved":
      return "Подтверждено";
    case "rejected":
      return "Отклонено";
    case "applied":
      return labels.applied;
    case "apply_failed":
      return "Не применено";
    case "rollback_approved":
      return "Откат подтверждён";
    case "rolled_back":
      return labels.rolledBack;
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

/** Сохраняет отдельные подтверждения записи и отката для каждой версии операции. */
export const DataOperationCard = ({
  onDraftChange,
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
  const pageDraft =
    operation.kind === "pages.createDraft.v1" ||
    operation.kind === "pages.updateDraft.v1";
  const labels = dataOperationPresentation(operation);
  useEffect(() => {
    onDraftChange?.(
      operation.state === "awaiting_approval" &&
        rejecting &&
        Boolean(rejectionReason),
    );
  }, [onDraftChange, operation.state, rejecting, rejectionReason]);

  return (
    <section className={styles.card} data-testid="data-operation-card">
      <header
        className={`${styles.header} ${pageDraft ? styles.pageDraftHeader : ""}`}
      >
        <span className={styles.icon} aria-hidden="true">
          {pageDraft ? <FileText size={17} /> : <Database size={17} />}
        </span>
        <div>
          <span>Изменение данных · версия {operation.version}</span>
          <strong>{operation.title}</strong>
        </div>
        <span className={`${styles.state} ${stateTone(operation.state)}`}>
          {stateLabel(operation.state, labels)}
        </span>
      </header>

      <div className={styles.summaryGrid}>
        <div>
          <span>Операция</span>
          <strong>{labels.operation}</strong>
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
          <strong>{labels.rollback}</strong>
        </div>
      </div>

      <DataOperationPreview operation={operation} />

      {operation.state === "awaiting_approval" ? (
        <div className={styles.expiry}>
          <Clock3 size={14} />
          {expired
            ? "Срок подтверждения истёк"
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
            Изменение{" "}
            {operation.approval.decision === "approved"
              ? "подтверждено"
              : "отклонено"}
            {` ролью ${operation.approval.actorRole}.`}
          </span>
        </div>
      ) : null}

      {operation.rollbackApproval ? (
        <div className={styles.decision}>
          <RotateCcw size={16} />
          <span>
            {labels.rollbackApproved} ролью{" "}
            {operation.rollbackApproval.actorRole}.
          </span>
        </div>
      ) : null}

      {operation.state === "approved" ? (
        <div className={styles.executeAction}>
          <div>
            <strong>{labels.applyTitle}</strong>
            <span>{labels.applyHint}</span>
          </div>
          <button disabled={pending} onClick={onApply} type="button">
            <Play size={15} fill="currentColor" />
            {pending ? labels.applying : labels.apply}
          </button>
        </div>
      ) : null}

      {pageDraft && operation.result && operation.state !== "rolled_back" ? (
        <div className={styles.executeAction}>
          <div>
            <strong>
              Черновик «{operation.result.page.title}» {labels.result}
            </strong>
            <span>
              Страница сохранена без публикации. Проверьте её в редакторе.
            </span>
          </div>
          <a
            className={getUiButtonClassName({
              size: "small",
              variant: "secondary",
            })}
            href={operation.result.adminUrl}
          >
            Открыть черновик
          </a>
        </div>
      ) : null}

      {operation.state === "applied" ? (
        <div className={styles.executeAction}>
          <div>
            <strong>{labels.rollbackTitle}</strong>
            <span>{labels.rollbackHint}</span>
          </div>
          <button disabled={pending} onClick={onApproveRollback} type="button">
            <RotateCcw size={15} />
            {pending ? "Подтверждаем…" : labels.approveRollback}
          </button>
        </div>
      ) : null}

      {operation.state === "rollback_approved" ? (
        <div className={styles.executeAction}>
          <div>
            <strong>{labels.rollbackReady}</strong>
            <span>{labels.rollbackReadyHint}</span>
          </div>
          <button disabled={pending} onClick={onRollback} type="button">
            <RotateCcw size={15} />
            {pending ? labels.rollingBack : labels.executeRollback}
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
                disabled={pending}
                maxLength={1_000}
                onChange={(event) => setRejectionReason(event.target.value)}
                rows={3}
                value={rejectionReason}
              />
            </label>
            <div>
              <button
                disabled={pending}
                onClick={() => {
                  setRejecting(false);
                  setRejectionReason("");
                }}
                type="button"
              >
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
              {pending ? "Сохраняем…" : labels.approve}
            </button>
          </div>
        )
      ) : null}
    </section>
  );
};
