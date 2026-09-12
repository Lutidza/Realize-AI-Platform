/**
 * @file packages/payload-ai-plugin/src/admin/ChangeRequestCard.tsx
 * @version 1.0.0
 * @date 2026-09-11
 * @description Отображает plan, implementation, preview, source promotion и release gates.
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
import type {
  ChangeRequestCardProps,
  CompletedStageProps,
} from "./ChangeRequestCard.types";
import { ExecutionEvidence } from "./ExecutionEvidence";
import { PreviewEvidence } from "./PreviewEvidence";
import { ReleaseEvidence } from "./ReleaseEvidence";
import { SourcePromotionSection } from "./SourcePromotionSection";

/** Завершённый этап сохраняет подробности для просмотра внутри свёрнутого блока. */
const CompletedStage = ({
  approved,
  children,
  description,
  title,
}: CompletedStageProps) => (
  <details
    className={styles.completedStage}
    data-decision={approved ? "approved" : "rejected"}
  >
    <summary>
      {approved ? <Check size={16} /> : <X size={16} />}
      <span>
        <strong>{title}</strong>
        <small>{description}</small>
      </span>
      <ChevronDown className={styles.completedStageChevron} size={16} />
    </summary>
    {children}
  </details>
);

const stateLabel = (change: ChangeRequestDTO): string => {
  if (change.release.approval?.decision === "approved")
    return "Release утверждён";
  if (change.release.approval?.decision === "rejected")
    return "Release отклонён";
  if (change.state === "awaiting_release_approval")
    return "Нужно утвердить release";
  if (change.state === "release_preparing") return "Готовим OCI release";
  if (change.state === "release_failed") return "Release не подготовлен";
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

/** Отделяет plan/release approvals от обычного подтверждения в разговоре. */
export const ChangeRequestCard = ({
  change,
  onApprove,
  onAcceptImplementation,
  onAcceptPreview,
  onApproveRelease,
  onDeployPreview,
  onExecute,
  onPrepareRelease,
  onPublishPullRequest,
  onReject,
  onRejectImplementation,
  onRejectPreview,
  onRejectRelease,
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

      <details
        className={styles.details}
        key={change.approval?.id || "awaiting-plan-decision"}
      >
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
            {change.approval.decision === "approved"
              ? "План утверждён"
              : "План отклонён"}{" "}
            ролью {change.approval.actorRole}.
            {!change.execution.job ? " Выполнение ещё не запускалось." : ""}
          </span>
        </div>
      ) : null}

      {change.execution.job ? (
        change.acceptance ? (
          <CompletedStage
            approved={change.acceptance.decision === "approved"}
            description={
              change.acceptance.decision === "approved"
                ? "Diff и проверки сохранены"
                : "Evidence доступно для аудита"
            }
            title={
              change.acceptance.decision === "approved"
                ? "Изменение принято"
                : "Изменение отклонено"
            }
          >
            <ExecutionEvidence
              acceptance={change.acceptance}
              job={change.execution.job}
              onAccept={onAcceptImplementation}
              onReject={onRejectImplementation}
              pending={pending}
              reason={change.execution.reason}
              worker={change.execution.worker}
            />
          </CompletedStage>
        ) : (
          <ExecutionEvidence
            acceptance={change.acceptance}
            job={change.execution.job}
            onAccept={onAcceptImplementation}
            onReject={onRejectImplementation}
            pending={pending}
            reason={change.execution.reason}
            worker={change.execution.worker}
          />
        )
      ) : null}

      {change.preview.deployment ? (
        change.preview.acceptance ? (
          <CompletedStage
            approved={change.preview.acceptance.decision === "approved"}
            description={
              change.preview.acceptance.decision === "approved"
                ? "Artifact и review сохранены"
                : "Evidence доступно для аудита"
            }
            title={
              change.preview.acceptance.decision === "approved"
                ? "Preview принят"
                : "Preview отклонён"
            }
          >
            <PreviewEvidence
              acceptance={change.preview.acceptance}
              deployment={change.preview.deployment}
              onAccept={onAcceptPreview}
              onReject={onRejectPreview}
              pending={pending}
            />
          </CompletedStage>
        ) : (
          <PreviewEvidence
            acceptance={change.preview.acceptance}
            deployment={change.preview.deployment}
            onAccept={onAcceptPreview}
            onReject={onRejectPreview}
            pending={pending}
          />
        )
      ) : null}

      {change.release.candidate ? (
        change.release.approval ? (
          <CompletedStage
            approved={change.release.approval.decision === "approved"}
            description={
              change.release.approval.decision === "approved"
                ? "Production deploy не запускался"
                : "Candidate сохранён для аудита"
            }
            title={
              change.release.approval.decision === "approved"
                ? "Release утверждён"
                : "Release отклонён"
            }
          >
            <ReleaseEvidence
              approval={change.release.approval}
              candidate={change.release.candidate}
              onApprove={onApproveRelease}
              onReject={onRejectRelease}
              pending={pending}
            />
          </CompletedStage>
        ) : (
          <ReleaseEvidence
            approval={change.release.approval}
            candidate={change.release.candidate}
            onApprove={onApproveRelease}
            onReject={onRejectRelease}
            pending={pending}
          />
        )
      ) : null}

      <SourcePromotionSection
        onPublish={onPublishPullRequest}
        pending={pending}
        sourcePromotion={change.sourcePromotion}
      />

      {change.release.enabled ? (
        <div className={styles.executeAction}>
          <div>
            <strong>Подписанный OCI release candidate</strong>
            <span>
              Server-owned orchestrator соберёт exact commit, проверит SBOM и
              signature, затем развернёт отдельный OCI preview.
            </span>
          </div>
          <button disabled={pending} onClick={onPrepareRelease} type="button">
            <Play size={15} fill="currentColor" />
            {pending ? "Ставим в очередь…" : "Подготовить release"}
          </button>
        </div>
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

      {change.execution.reason &&
      !change.execution.job &&
      !change.acceptance ? (
        <footer className={styles.executionNotice}>
          <LockKeyhole size={14} />
          {change.execution.reason}
        </footer>
      ) : null}
      {change.preview.reason && !change.preview.acceptance ? (
        <footer className={styles.executionNotice}>
          <LockKeyhole size={14} />
          {change.preview.reason}
        </footer>
      ) : null}
      {change.release.reason && !change.release.approval ? (
        <footer className={styles.executionNotice}>
          <LockKeyhole size={14} />
          {change.release.reason}
        </footer>
      ) : null}
      {change.sourcePromotion.reason &&
      (!change.sourcePromotion.promotion ||
        change.sourcePromotion.promotion.status === "queued") ? (
        <footer className={styles.executionNotice}>
          <LockKeyhole size={14} />
          {change.sourcePromotion.reason}
        </footer>
      ) : null}
    </section>
  );
};
