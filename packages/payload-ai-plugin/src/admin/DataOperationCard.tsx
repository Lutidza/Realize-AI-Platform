/**
 * @file packages/payload-ai-plugin/src/admin/DataOperationCard.tsx
 * @version 1.7.1
 * @date 2026-10-12
 * @description Показывает подтверждение, результат и безопасный откат изменений данных.
 * @docref Realize — AI Platform v1.0 — Data/Config Pipeline
 * @see documentation/specifications/realize-ai-commerce/v1.0/02-change-engine-and-pipelines/14-data-config-pipeline.md
 */

"use client";

import type { DataOperationDTO } from "@realize/ai-contracts";
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
import { PagePublicationResult } from "./PagePublicationResult.component";
import { PageOperationLinks } from "./PageOperationLinks.component";
import { PagePublicationReview } from "./PagePublicationReview.component";
import { usePagePublicationReview } from "./usePagePublicationReview.hook";
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
  onPreparePublication,
  onPreparePublicationRestore,
  onRetryPublicationDelivery,
  staleMarker,
}: DataOperationCardProps) => {
  const [rejecting, setRejecting] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [approvalNow] = useState(() => Date.now());
  const publication =
    operation.kind === "pages.publishDraft.v1" ||
    operation.kind === "pages.restorePublication.v1";
  const blockedReason =
    publication &&
    staleMarker?.operationID === operation.id &&
    staleMarker.expectedVersion === operation.version &&
    staleMarker.expectedOperationHash === operation.operationHash
      ? staleMarker.message
      : undefined;
  const publicationReview = usePagePublicationReview(operation, pending);
  const expired = publication
    ? publicationReview.expired
    : Date.parse(operation.expiresAt) <= approvalNow;
  const pageDraft =
    operation.kind === "pages.createDraft.v1" ||
    operation.kind === "pages.updateDraft.v1" ||
    operation.kind === "pages.updateStructureDraft.v1";
  const labels = dataOperationPresentation(operation);
  const pageLinks = publication
    ? operation
    : pageDraft && operation.state !== "rolled_back"
      ? operation.result
      : undefined;
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
        className={`${styles.header} ${pageDraft || publication ? styles.pageDraftHeader : ""}`}
      >
        <span className={styles.icon} aria-hidden="true">
          {pageDraft || publication ? (
            <FileText size={17} />
          ) : (
            <Database size={17} />
          )}
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

      {operation.kind === "pages.publishDraft.v1" &&
      operation.approval?.previewEvidence ? (
        <p className={styles.executionNotice}>
          Пользователь подтвердил просмотр на компьютере и телефоне без
          обнаруженных ошибок отображения —{" "}
          {new Date(
            operation.approval.previewEvidence.reviewedAt,
          ).toLocaleString("ru-RU")}
          .
        </p>
      ) : null}

      {operation.state === "approved" ? (
        <div className={styles.executeAction}>
          <div>
            <strong>{labels.applyTitle}</strong>
            <span>{labels.applyHint}</span>
          </div>
          <button
            disabled={
              pending || (publication && expired) || Boolean(blockedReason)
            }
            onClick={onApply}
            type="button"
          >
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
            <span>Страница сохранена без публикации.</span>
          </div>
        </div>
      ) : null}

      {pageLinks ? (
        <PageOperationLinks
          adminUrl={pageLinks.adminUrl}
          frontendPreviewUrl={pageLinks.frontendPreviewUrl}
        />
      ) : null}

      {pageDraft &&
      operation.result &&
      operation.state === "applied" &&
      onPreparePublication ? (
        <div className={styles.executeAction}>
          <div>
            <strong>Публикация страницы</strong>
            <span>
              Подготовьте план, затем проверьте страницу в редакторе и
              подтвердите публикацию.
            </span>
          </div>
          <button
            type="button"
            disabled={pending}
            onClick={onPreparePublication}
          >
            Подготовить публикацию
          </button>
        </div>
      ) : null}

      {publication && operation.state === "applied" ? (
        <PagePublicationResult
          operation={operation}
          pending={pending}
          onPrepareRestore={onPreparePublicationRestore}
          onRetryDelivery={onRetryPublicationDelivery}
        />
      ) : null}

      {operation.state === "applied" && !publication ? (
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

      {operation.state === "rollback_approved" && !publication ? (
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
      {blockedReason ? (
        <p className={styles.blockedReason} role="status">
          {blockedReason}
        </p>
      ) : null}

      {operation.kind === "pages.publishDraft.v1" &&
      operation.state === "awaiting_approval" &&
      !expired &&
      !rejecting ? (
        <PagePublicationReview
          checks={publicationReview.checks}
          disabled={pending || Boolean(blockedReason)}
          onChange={publicationReview.onChange}
        />
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
              disabled={
                pending ||
                Boolean(blockedReason) ||
                (operation.kind === "pages.publishDraft.v1" &&
                  !publicationReview.review)
              }
              onClick={() => {
                if (operation.kind !== "pages.publishDraft.v1") onApprove();
                else if (publicationReview.review)
                  onApprove(publicationReview.review);
              }}
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
