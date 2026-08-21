/**
 * @file services/ai-execution-worker/src/promotionRepository.ts
 * @owner services/ai-execution-worker
 * @purpose Claims preview promotions atomically and persists review, checks and runtime evidence.
 */

import type { Pool, PoolClient, QueryResultRow } from "pg";

import type { WorkerCheckResult } from "./types";
import type {
  ClaimedPreviewDeployment,
  IndependentReviewResult,
  LocalPreviewRuntime,
  PreviewCleanupTarget,
  PromotionCommit,
} from "./previewTypes";

type PromotionRow = QueryResultRow & {
  acceptance_bound_hash: string | null;
  acceptance_decision: string | null;
  acceptance_diff_hash: string | null;
  allowed_paths: unknown;
  artifacts_expire_at: Date | string;
  base_commit: string;
  bound_implementation_hash: string;
  branch: string;
  change_request_id: number;
  change_state: string;
  changed_paths: unknown;
  deployment_key: string;
  diff: string | null;
  diff_hash: string | null;
  diff_truncated: boolean;
  execution_job_id: number;
  execution_status: string;
  expires_at: Date | string;
  id: number;
  original_request: string;
  plan: string;
  required_checks: unknown;
  source_diff_hash: string;
  source_evidence_hash: string;
  workspace_i_d: string;
};

type CleanupRow = QueryResultRow & {
  branch: string;
  change_request_id: number;
  database_name: string | null;
  expires_at: Date | string;
  id: number;
  process_i_d: string | number | null;
  status: string;
  workspace_i_d: string;
};

const strings = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];

const iso = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

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

const invalidPromotionReason = (row: PromotionRow): string | undefined => {
  if (row.change_state !== "preview_queued") {
    return "Change Request state no longer permits preview promotion.";
  }
  if (
    row.execution_status !== "completed" ||
    row.diff_truncated ||
    !row.diff ||
    !row.diff_hash ||
    row.diff_hash !== row.source_diff_hash
  ) {
    return "Source execution artifact is incomplete or no longer hash-bound.";
  }
  if (new Date(row.artifacts_expire_at).getTime() <= Date.now()) {
    return "Source execution artifact expired before promotion.";
  }
  if (
    row.acceptance_decision !== "approved" ||
    row.acceptance_bound_hash !== row.bound_implementation_hash ||
    row.acceptance_diff_hash !== row.source_diff_hash
  ) {
    return "Implementation acceptance no longer matches the promoted diff.";
  }
  return undefined;
};

const mapPromotion = (row: PromotionRow): ClaimedPreviewDeployment => ({
  allowedPaths: strings(row.allowed_paths),
  baseCommit: row.base_commit,
  branch: row.branch,
  changeRequestID: row.change_request_id,
  deploymentKey: row.deployment_key,
  diff: String(row.diff),
  executionJobID: row.execution_job_id,
  expectedPaths: strings(row.changed_paths),
  expiresAt: iso(row.expires_at),
  id: row.id,
  originalRequest: row.original_request,
  plan: row.plan,
  requiredChecks: strings(row.required_checks),
  sourceDiffHash: row.source_diff_hash,
  sourceEvidenceHash: row.source_evidence_hash,
  workspaceID: row.workspace_i_d,
});

/** PostgreSQL-backed queue for accepted-diff local preview promotion. */
export class PromotionRepository {
  constructor(private readonly pool: Pool) {}

  async claimNext(
    workerID: string,
  ): Promise<ClaimedPreviewDeployment | undefined> {
    return await transaction(this.pool, async (client) => {
      const selected = await client.query<PromotionRow>(
        `SELECT deployments.*,
                changes.state AS change_state,
                changes.plan,
                changes.original_request,
                jobs.allowed_paths,
                jobs.artifacts_expire_at,
                jobs.changed_paths,
                jobs.diff,
                jobs.diff_hash,
                jobs.diff_truncated,
                jobs.status AS execution_status,
                acceptance.bound_hash AS acceptance_bound_hash,
                acceptance.decision AS acceptance_decision,
                acceptance.diff_hash AS acceptance_diff_hash
           FROM realize_ai_deployments AS deployments
           JOIN realize_ai_change_requests AS changes
             ON changes.id = deployments.change_request_id
           JOIN realize_ai_execution_jobs AS jobs
             ON jobs.id = deployments.execution_job_id
           LEFT JOIN realize_ai_approvals AS acceptance
             ON acceptance.change_request_id = deployments.change_request_id
            AND acceptance.type = 'IMPLEMENTATION_ACCEPTANCE'
          WHERE deployments.status = 'queued'
          ORDER BY deployments.created_at ASC
          FOR UPDATE OF deployments, changes SKIP LOCKED
          LIMIT 1`,
      );
      const row = selected.rows[0];
      if (!row) return undefined;
      const invalidReason = invalidPromotionReason(row);
      if (invalidReason) {
        await client.query(
          `UPDATE realize_ai_deployments
              SET status = 'blocked', stage = 'complete',
                  error_summary = $2, completed_at = now(), updated_at = now()
            WHERE id = $1`,
          [row.id, invalidReason],
        );
        await client.query(
          `UPDATE realize_ai_change_requests
              SET state = 'blocked', blocked_reason = $2,
                  version = version + 1, updated_at = now()
            WHERE id = $1 AND state = 'preview_queued'`,
          [row.change_request_id, invalidReason],
        );
        return undefined;
      }
      const change = await client.query(
        `UPDATE realize_ai_change_requests
            SET state = 'preview_preparing', version = version + 1, updated_at = now()
          WHERE id = $1 AND state = 'preview_queued'`,
        [row.change_request_id],
      );
      if (change.rowCount !== 1)
        throw new Error("Preview claim state conflict.");
      await client.query(
        `UPDATE realize_ai_deployments
            SET status = 'preparing_workspace', stage = 'workspace_preparation',
                worker_i_d = $2, attempt = attempt + 1,
                started_at = COALESCE(started_at, now()), updated_at = now()
          WHERE id = $1 AND status = 'queued'`,
        [row.id, workerID],
      );
      return mapPromotion(row);
    });
  }

  async markRunningChecks(job: ClaimedPreviewDeployment): Promise<void> {
    await this.updateState(job, {
      changeState: "preview_validating",
      expectedChangeState: "preview_preparing",
      expectedStatus: "preparing_workspace",
      stage: "validation",
      status: "running_checks",
    });
  }

  async markReviewing(job: ClaimedPreviewDeployment): Promise<void> {
    await this.updateState(job, {
      changeState: "preview_reviewing",
      expectedChangeState: "preview_validating",
      expectedStatus: "running_checks",
      stage: "independent_review",
      status: "reviewing",
    });
  }

  async recordReview(
    job: ClaimedPreviewDeployment,
    review: IndependentReviewResult,
  ): Promise<void> {
    const updated = await this.pool.query(
      `UPDATE realize_ai_deployments
          SET review_status = $2, review_summary = $3,
              review_findings = $4::jsonb, review_evidence_hash = $5,
              review_model = $6, review_completed_at = $7, updated_at = now()
        WHERE id = $1 AND status = 'reviewing'`,
      [
        job.id,
        review.status,
        review.summary,
        JSON.stringify(review.findings),
        review.evidenceHash,
        review.model,
        review.completedAt,
      ],
    );
    if (updated.rowCount !== 1)
      throw new Error("Preview review state conflict.");
  }

  async markCommitting(job: ClaimedPreviewDeployment): Promise<void> {
    await this.updateState(job, {
      changeState: "preview_committing",
      expectedChangeState: "preview_reviewing",
      expectedStatus: "reviewing",
      stage: "commit",
      status: "committing",
    });
  }

  async markStartingPreview(
    job: ClaimedPreviewDeployment,
    commit: PromotionCommit,
  ): Promise<void> {
    await transaction(this.pool, async (client) => {
      const deployment = await client.query(
        `UPDATE realize_ai_deployments
            SET status = 'starting_preview', stage = 'preview_startup',
                commit_s_h_a = $2, tree_hash = $3, artifact_hash = $4,
                updated_at = now()
          WHERE id = $1 AND status = 'committing'`,
        [job.id, commit.commitSHA, commit.treeHash, commit.artifactHash],
      );
      const change = await client.query(
        `UPDATE realize_ai_change_requests
            SET state = 'preview_starting', version = version + 1, updated_at = now()
          WHERE id = $1 AND state = 'preview_committing'`,
        [job.changeRequestID],
      );
      if (deployment.rowCount !== 1 || change.rowCount !== 1) {
        throw new Error("Preview startup state conflict.");
      }
    });
  }

  async addCheckResult(
    job: ClaimedPreviewDeployment,
    result: WorkerCheckResult,
    sequence: number,
    stage: "preview_smoke" | "preview_validation",
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO realize_ai_check_results
        (deployment_id, stage, sequence, command, status, started_at, finished_at,
         duration_ms, output_summary, evidence_hash, result_key, updated_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now(), now())
       ON CONFLICT (result_key) DO NOTHING`,
      [
        job.id,
        stage,
        sequence,
        result.command,
        result.status,
        result.startedAt,
        result.finishedAt,
        result.durationMs,
        result.outputSummary,
        result.evidenceHash,
        `${job.deploymentKey}:${stage}:${sequence}`,
      ],
    );
  }

  async complete(
    job: ClaimedPreviewDeployment,
    input: {
      commit: PromotionCommit;
      evidenceHash: string;
      runtime: LocalPreviewRuntime;
    },
  ): Promise<void> {
    await transaction(this.pool, async (client) => {
      const deployment = await client.query(
        `UPDATE realize_ai_deployments
            SET status = 'ready', stage = 'complete', runtime_state = 'active',
                commit_s_h_a = $2, tree_hash = $3, artifact_hash = $4,
                evidence_hash = $5, preview_u_r_l = $6, health_summary = $7,
                database_name = $8, process_i_d = $9,
                completed_at = now(), updated_at = now()
          WHERE id = $1 AND status = 'starting_preview'`,
        [
          job.id,
          input.commit.commitSHA,
          input.commit.treeHash,
          input.commit.artifactHash,
          input.evidenceHash,
          input.runtime.previewURL,
          input.runtime.healthSummary,
          input.runtime.databaseName,
          input.runtime.processID,
        ],
      );
      const change = await client.query(
        `UPDATE realize_ai_change_requests
            SET state = 'preview_ready', version = version + 1, updated_at = now()
          WHERE id = $1 AND state = 'preview_starting'`,
        [job.changeRequestID],
      );
      if (deployment.rowCount !== 1 || change.rowCount !== 1) {
        throw new Error("Preview completion state conflict.");
      }
    });
  }

  async fail(
    job: ClaimedPreviewDeployment,
    input: {
      blocked: boolean;
      cleanupPending: boolean;
      runtime?: LocalPreviewRuntime;
      summary: string;
    },
  ): Promise<void> {
    const deploymentStatus = input.blocked ? "blocked" : "failed";
    const changeState = input.blocked ? "blocked" : "preview_failed";
    await transaction(this.pool, async (client) => {
      await client.query(
        `UPDATE realize_ai_deployments
            SET status = $2, stage = 'complete', runtime_state = $4,
                error_summary = $3, database_name = $5, process_i_d = $6,
                completed_at = now(), updated_at = now()
          WHERE id = $1`,
        [
          job.id,
          deploymentStatus,
          input.summary,
          input.cleanupPending ? "active" : "stopped",
          input.cleanupPending ? input.runtime?.databaseName || null : null,
          input.cleanupPending ? input.runtime?.processID || null : null,
        ],
      );
      await client.query(
        `UPDATE realize_ai_change_requests
            SET state = $2, blocked_reason = $3,
                version = version + 1, updated_at = now()
          WHERE id = $1`,
        [job.changeRequestID, changeState, input.summary],
      );
    });
  }

  async listCleanupTargets(): Promise<PreviewCleanupTarget[]> {
    const result = await this.pool.query<CleanupRow>(
      `SELECT id, change_request_id, branch, workspace_i_d, database_name,
              process_i_d, status, expires_at
         FROM realize_ai_deployments
        WHERE runtime_state = 'active'
          AND (expires_at <= now() OR status IN ('rejected', 'failed', 'blocked', 'cancelled'))
        ORDER BY expires_at ASC
        LIMIT 20`,
    );
    return result.rows.map((row) => ({
      branch: row.branch,
      changeRequestID: row.change_request_id,
      databaseName: row.database_name || undefined,
      expiresAt: iso(row.expires_at),
      id: row.id,
      processID: row.process_i_d === null ? undefined : Number(row.process_i_d),
      status: row.status,
      workspaceID: row.workspace_i_d,
    }));
  }

  async markRuntimeStopped(target: PreviewCleanupTarget): Promise<void> {
    await transaction(this.pool, async (client) => {
      const expired =
        target.status === "ready" && Date.parse(target.expiresAt) <= Date.now();
      await client.query(
        `UPDATE realize_ai_deployments
            SET status = CASE WHEN $2 THEN 'expired' ELSE status END,
                runtime_state = 'stopped', preview_u_r_l = NULL,
                process_i_d = NULL, database_name = NULL,
                health_summary = COALESCE(health_summary, '') || $3,
                updated_at = now()
          WHERE id = $1 AND runtime_state = 'active'`,
        [target.id, expired, " Preview runtime cleaned."],
      );
      if (expired) {
        await client.query(
          `UPDATE realize_ai_change_requests
              SET state = 'preview_failed', blocked_reason = 'Local preview expired before acceptance.',
                  version = version + 1, updated_at = now()
            WHERE id = $1 AND state = 'preview_ready'`,
          [target.changeRequestID],
        );
      }
    });
  }

  private async updateState(
    job: ClaimedPreviewDeployment,
    input: {
      changeState: string;
      expectedChangeState: string;
      expectedStatus: string;
      stage: string;
      status: string;
    },
  ): Promise<void> {
    await transaction(this.pool, async (client) => {
      const deployment = await client.query(
        `UPDATE realize_ai_deployments
            SET status = $2, stage = $3, updated_at = now()
          WHERE id = $1 AND status = $4`,
        [job.id, input.status, input.stage, input.expectedStatus],
      );
      const change = await client.query(
        `UPDATE realize_ai_change_requests
            SET state = $2, version = version + 1, updated_at = now()
          WHERE id = $1 AND state = $3`,
        [job.changeRequestID, input.changeState, input.expectedChangeState],
      );
      if (deployment.rowCount !== 1 || change.rowCount !== 1) {
        throw new Error("Preview promotion state transition conflict.");
      }
    });
  }
}
