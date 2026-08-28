/**
 * @file packages/payload-ai-plugin/src/admin/SourcePromotionSection.tsx
 * @version 2026-08-28
 * @docref ADR-0013
 * @see documentation/architecture/decisions/ADR-0013-github-pull-request-source-promotion.md
 * @description Показывает source promotion progress и запускает exact-commit draft PR publication.
 */

"use client";

import type { ChangeSourcePromotionDTO } from "@realize/ai-contracts";
import {
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  GitPullRequest,
  Loader2,
  ShieldCheck,
  XCircle,
} from "lucide-react";

import styles from "./PreviewEvidence.module.css";

type SourcePromotionSectionProps = {
  onPublish: () => void;
  pending: boolean;
  sourcePromotion: ChangeSourcePromotionDTO;
};

const statusLabel = {
  blocked: "Source promotion заблокирована",
  creating_pull_request: "Создаём draft Pull Request",
  failed: "Pull Request не создан",
  publishing_ref: "Публикуем exact commit",
  queued: "Source promotion в очереди",
  ready: "Draft Pull Request создан",
  validating: "Проверяем source binding",
} as const;

const activeStatuses = new Set([
  "creating_pull_request",
  "publishing_ref",
  "queued",
  "validating",
]);

/** Отделяет публикацию source branch/PR от preview и production release. */
export const SourcePromotionSection = ({
  onPublish,
  pending,
  sourcePromotion,
}: SourcePromotionSectionProps) => {
  const promotion = sourcePromotion.promotion;

  if (!promotion && !sourcePromotion.enabled) return null;
  if (!promotion) {
    return (
      <section className={styles.preview} data-testid="source-promotion-action">
        <header className={styles.header}>
          <span className={styles.icon} aria-hidden="true">
            <GitPullRequest size={16} />
          </span>
          <div>
            <strong>GitHub draft Pull Request</strong>
            <span>
              Exact preview commit попадёт только в ветку `ai/changes/*`.
            </span>
          </div>
          <span className={styles.stage}>source</span>
        </header>
        <div className={styles.actions}>
          <button disabled={pending} onClick={onPublish} type="button">
            <GitPullRequest size={15} />
            {pending ? "Ставим в очередь…" : "Опубликовать draft PR"}
          </button>
        </div>
      </section>
    );
  }

  const active = activeStatuses.has(promotion.status);
  return (
    <section className={styles.preview} data-testid="source-promotion-evidence">
      <header className={styles.header}>
        <span className={styles.icon} aria-hidden="true">
          {active ? (
            <Loader2 className={styles.spin} size={16} />
          ) : promotion.status === "ready" ? (
            <CheckCircle2 size={16} />
          ) : (
            <XCircle size={16} />
          )}
        </span>
        <div>
          <strong>{statusLabel[promotion.status]}</strong>
          <span>
            {active
              ? "Main, production и текущий checkout не изменяются"
              : promotion.errorSummary ||
                `${promotion.repositorySlug} · ${promotion.pullRequestState || "pending"}`}
          </span>
        </div>
        <span className={styles.stage}>{promotion.stage}</span>
      </header>

      <div className={styles.artifactBar}>
        <GitPullRequest size={14} />
        <span title={promotion.headBranch}>{promotion.headBranch}</span>
        <code title={promotion.gitCommit}>
          {promotion.gitCommit.slice(0, 12)}
        </code>
      </div>

      {promotion.pullRequestURL ? (
        <a
          className={styles.previewLink}
          href={promotion.pullRequestURL}
          rel="noreferrer"
          target="_blank"
        >
          <span>
            <strong>Открыть Pull Request #{promotion.pullRequestNumber}</strong>
            <small>{promotion.pullRequestURL}</small>
          </span>
          <ExternalLink size={15} />
        </a>
      ) : null}

      {promotion.evidenceHash ? (
        <details className={styles.details}>
          <summary>
            <span>
              <ShieldCheck size={15} /> Source evidence
            </span>
            <ChevronDown size={15} />
          </summary>
          <div className={styles.detailsBody}>
            <dl className={styles.hashes}>
              <div>
                <dt>Preview</dt>
                <dd title={promotion.sourcePreviewArtifactHash}>
                  {promotion.sourcePreviewArtifactHash.slice(0, 24)}…
                </dd>
              </div>
              <div>
                <dt>Evidence</dt>
                <dd title={promotion.evidenceHash}>
                  {promotion.evidenceHash.slice(0, 24)}…
                </dd>
              </div>
              <div>
                <dt>Base</dt>
                <dd>{promotion.baseBranch}</dd>
              </div>
              <div>
                <dt>Draft</dt>
                <dd>{promotion.draft ? "yes" : "no"}</dd>
              </div>
            </dl>
          </div>
        </details>
      ) : null}

      {sourcePromotion.enabled && !active && promotion.status !== "ready" ? (
        <div className={styles.actions}>
          <button disabled={pending} onClick={onPublish} type="button">
            <GitPullRequest size={15} />
            {pending ? "Ставим в очередь…" : "Повторить публикацию"}
          </button>
        </div>
      ) : null}
    </section>
  );
};
