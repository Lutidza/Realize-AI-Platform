/**
 * @file services/ai-execution-worker/src/sourcePromotionRepository.ts
 * @version 2026-08-28
 * @docref ADR-0013
 * @see documentation/architecture/decisions/ADR-0013-github-pull-request-source-promotion.md
 * @description Atomically claims source promotions и сохраняет redacted Pull Request evidence.
 */

import type { Pool, PoolClient, QueryResultRow } from "pg";

import type {
  ClaimedSourcePromotion,
  PublishedPullRequest,
} from "./sourcePromotionTypes";

type SourcePromotionRow = QueryResultRow & {
  acceptance_artifact_hash: string | null;
  acceptance_bound_hash: string | null;
  acceptance_decision: string | null;
  base_branch: string;
  change_request_id: number;
  change_state: string;
  change_title: string;
  deployment_artifact_hash: string | null;
  deployment_commit_s_h_a: string | null;
  deployment_evidence_hash: string | null;
  deployment_expires_at: Date | string;
  deployment_status: string;
  git_commit: string;
  head_branch: string;
  id: number;
  integration_revision: string | number;
  promotion_key: string;
  repository_slug: string;
  source_acceptance_hash: string;
  source_preview_artifact_hash: string;
  source_preview_evidence_hash: string;
};

const sourceEligibleStates = new Set([
  "awaiting_release_approval",
  "preview_accepted",
  "release_approved",
  "release_failed",
  "release_preparing",
]);

const transaction = async <T>(
  pool: Pool,
  operation: (client: PoolClient) => Promise<T>,
): Promise<T> => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

const invalidReason = (row: SourcePromotionRow): string | undefined => {
  if (!sourceEligibleStates.has(row.change_state)) {
    return "Change Request state no longer permits source promotion.";
  }
  if (
    row.deployment_status !== "accepted" ||
    !row.deployment_artifact_hash ||
    !row.deployment_commit_s_h_a ||
    !row.deployment_evidence_hash ||
    row.deployment_artifact_hash !== row.source_preview_artifact_hash ||
    row.deployment_commit_s_h_a !== row.git_commit ||
    row.deployment_evidence_hash !== row.source_preview_evidence_hash
  ) {
    return "Accepted preview evidence no longer matches the source promotion.";
  }
  if (new Date(row.deployment_expires_at).getTime() <= Date.now()) {
    return "Accepted preview artifact expired before source promotion.";
  }
  if (
    row.acceptance_decision !== "approved" ||
    row.acceptance_bound_hash !== row.source_acceptance_hash ||
    row.acceptance_artifact_hash !== row.source_preview_artifact_hash
  ) {
    return "Preview acceptance no longer matches the source promotion.";
  }
  return undefined;
};

const mapPromotion = (row: SourcePromotionRow): ClaimedSourcePromotion => ({
  baseBranch: row.base_branch,
  changeRequestID: row.change_request_id,
  changeTitle: row.change_title,
  gitCommit: row.git_commit,
  headBranch: row.head_branch,
  id: row.id,
  integrationRevision: Number(row.integration_revision),
  promotionKey: row.promotion_key,
  repositorySlug: row.repository_slug,
  sourceAcceptanceHash: row.source_acceptance_hash,
  sourcePreviewArtifactHash: row.source_preview_artifact_hash,
  sourcePreviewEvidenceHash: row.source_preview_evidence_hash,
});

/** PostgreSQL-backed queue одного source-control side effect. */
export class SourcePromotionWorkerRepository {
  constructor(private readonly pool: Pool) {}

  async claimNext(
    workerID: string,
  ): Promise<ClaimedSourcePromotion | undefined> {
    return await transaction(this.pool, async (client) => {
      const selected = await client.query<SourcePromotionRow>(
        `SELECT promotions.*,
                changes.state AS change_state,
                changes.title AS change_title,
                deployments.status AS deployment_status,
                deployments.artifact_hash AS deployment_artifact_hash,
                deployments.commit_s_h_a AS deployment_commit_s_h_a,
                deployments.evidence_hash AS deployment_evidence_hash,
                deployments.expires_at AS deployment_expires_at,
                acceptance.bound_hash AS acceptance_bound_hash,
                acceptance.decision AS acceptance_decision,
                acceptance.artifact_hash AS acceptance_artifact_hash
           FROM realize_ai_source_promotions AS promotions
           JOIN realize_ai_change_requests AS changes
             ON changes.id = promotions.change_request_id
           JOIN realize_ai_deployments AS deployments
             ON deployments.id = promotions.preview_deployment_id
           LEFT JOIN realize_ai_approvals AS acceptance
             ON acceptance.change_request_id = promotions.change_request_id
            AND acceptance.type = 'PREVIEW_ACCEPTANCE'
          WHERE promotions.status = 'queued'
          ORDER BY promotions.created_at ASC
          FOR UPDATE OF promotions, changes, deployments SKIP LOCKED
          LIMIT 1`,
      );
      const row = selected.rows[0];
      if (!row) return undefined;
      const reason = invalidReason(row);
      if (reason) {
        await client.query(
          `UPDATE realize_ai_source_promotions
              SET status = 'blocked', stage = 'complete',
                  error_summary = $2, completed_at = now(), updated_at = now()
            WHERE id = $1`,
          [row.id, reason],
        );
        return undefined;
      }
      const updated = await client.query(
        `UPDATE realize_ai_source_promotions
            SET status = 'validating', stage = 'source_validation',
                worker_i_d = $2, attempt = attempt + 1,
                started_at = COALESCE(started_at, now()), updated_at = now()
          WHERE id = $1 AND status = 'queued'`,
        [row.id, workerID],
      );
      if (updated.rowCount !== 1) {
        throw new Error("Source promotion claim conflict.");
      }
      return mapPromotion(row);
    });
  }

  async markPublishingRef(job: ClaimedSourcePromotion): Promise<void> {
    await this.updateStatus(
      job.id,
      "validating",
      "publishing_ref",
      "ref_publication",
    );
  }

  async markCreatingPullRequest(job: ClaimedSourcePromotion): Promise<void> {
    await this.updateStatus(
      job.id,
      "publishing_ref",
      "creating_pull_request",
      "pull_request",
    );
  }

  async complete(
    job: ClaimedSourcePromotion,
    pullRequest: PublishedPullRequest,
    evidenceHash: string,
  ): Promise<void> {
    const result = await this.pool.query(
      `UPDATE realize_ai_source_promotions
          SET status = 'ready', stage = 'complete',
              pull_request_number = $2, pull_request_u_r_l = $3,
              pull_request_state = $4, draft = $5, evidence_hash = $6,
              completed_at = now(), updated_at = now()
        WHERE id = $1 AND status = 'creating_pull_request'`,
      [
        job.id,
        pullRequest.number,
        pullRequest.url,
        pullRequest.state,
        pullRequest.draft,
        evidenceHash,
      ],
    );
    if (result.rowCount !== 1) {
      throw new Error("Source promotion completion state conflict.");
    }
  }

  async fail(
    job: ClaimedSourcePromotion,
    input: { blocked: boolean; summary: string },
  ): Promise<void> {
    await this.pool.query(
      `UPDATE realize_ai_source_promotions
          SET status = $2, stage = 'complete', error_summary = $3,
              completed_at = now(), updated_at = now()
        WHERE id = $1`,
      [job.id, input.blocked ? "blocked" : "failed", input.summary],
    );
  }

  private async updateStatus(
    id: number,
    expectedStatus: string,
    status: string,
    stage: string,
  ): Promise<void> {
    const updated = await this.pool.query(
      `UPDATE realize_ai_source_promotions
          SET status = $2, stage = $3, updated_at = now()
        WHERE id = $1 AND status = $4`,
      [id, status, stage, expectedStatus],
    );
    if (updated.rowCount !== 1) {
      throw new Error("Source promotion state transition conflict.");
    }
  }
}
