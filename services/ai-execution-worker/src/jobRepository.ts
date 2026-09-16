/**
 * @file services/ai-execution-worker/src/jobRepository.ts
 * @version 1.1.0
 * @date 2026-09-15
 * @description Атомарно сохраняет состояния заданий, серверную причину отказа и отдельное пояснение исполнителя.
 */

import type { Pool, PoolClient, QueryResultRow } from "pg";

import type { ExecutionCapabilityClaims } from "@realize/change-engine";

import type {
  ClaimedExecutionJob,
  WorkerCheckResult,
  WorktreeDiff,
} from "./types";

type JobRow = QueryResultRow & {
  allowed_paths: unknown;
  approved_version: string | number;
  artifacts_expire_at: Date | string;
  base_commit: string;
  bound_plan_hash: string;
  bound_scope_hash: string;
  branch: string;
  capability_expires_at: Date | string;
  capability_issued_at: Date | string;
  capability_nonce: string;
  capability_token_hash: string;
  change_request_id: number;
  checks: unknown;
  execution_key: string;
  id: number;
  original_request: string;
  plan: string;
  workspace_i_d: string;
};

const strings = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];

const iso = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

const mapJob = (row: JobRow): ClaimedExecutionJob => {
  const allowedPaths = strings(row.allowed_paths);
  const checks = strings(row.checks);
  const approvedVersion = Number(row.approved_version);
  const capability: ExecutionCapabilityClaims = {
    allowedPaths,
    baseCommit: row.base_commit,
    changeRequestID: String(row.change_request_id),
    checks,
    executionKey: row.execution_key,
    expiresAt: iso(row.capability_expires_at),
    issuedAt: iso(row.capability_issued_at),
    nonce: row.capability_nonce,
    planHash: row.bound_plan_hash,
    scopeHash: row.bound_scope_hash,
    version: approvedVersion,
  };
  return {
    allowedPaths,
    approvedVersion,
    artifactsExpireAt: iso(row.artifacts_expire_at),
    baseCommit: row.base_commit,
    branch: row.branch,
    capability,
    capabilityTokenHash: row.capability_token_hash,
    changeRequestID: row.change_request_id,
    checks,
    executionKey: row.execution_key,
    id: row.id,
    originalRequest: row.original_request,
    plan: row.plan,
    planHash: row.bound_plan_hash,
    scopeHash: row.bound_scope_hash,
    workspaceID: row.workspace_i_d,
  };
};

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

/** PostgreSQL-backed execution queue with transactional state projection. */
export class ExecutionJobRepository {
  constructor(private readonly pool: Pool) {}

  async claimNext(workerID: string): Promise<ClaimedExecutionJob | undefined> {
    return await transaction(this.pool, async (client) => {
      const selected = await client.query<JobRow>(
        `SELECT jobs.*, changes.plan, changes.original_request
           FROM realize_ai_execution_jobs AS jobs
           JOIN realize_ai_change_requests AS changes
             ON changes.id = jobs.change_request_id
          WHERE jobs.status = 'queued'
          ORDER BY jobs.created_at ASC
          FOR UPDATE OF jobs SKIP LOCKED
          LIMIT 1`,
      );
      const row = selected.rows[0];
      if (!row) return undefined;

      const state = await client.query(
        `UPDATE realize_ai_change_requests
            SET state = 'workspace_preparing',
                version = version + 1,
                updated_at = now()
          WHERE id = $1 AND state = 'execution_queued'`,
        [row.change_request_id],
      );
      if (state.rowCount !== 1) {
        await client.query(
          `UPDATE realize_ai_execution_jobs
              SET status = 'blocked', stage = 'complete',
                  error_summary = $2, finished_at = now(), updated_at = now()
            WHERE id = $1`,
          [row.id, "Change Request state no longer permits execution."],
        );
        return undefined;
      }

      await client.query(
        `UPDATE realize_ai_execution_jobs
            SET status = 'preparing_workspace',
                stage = 'workspace_preparation',
                worker_i_d = $2,
                attempt = attempt + 1,
                started_at = COALESCE(started_at, now()),
                updated_at = now()
          WHERE id = $1`,
        [row.id, workerID],
      );
      return mapJob(row);
    });
  }

  async markRunning(job: ClaimedExecutionJob): Promise<void> {
    await this.updateState(job, {
      changeState: "executing",
      expectedChangeState: "workspace_preparing",
      expectedJobStatus: "preparing_workspace",
      jobStatus: "running",
      stage: "implementation",
    });
  }

  async markValidating(job: ClaimedExecutionJob): Promise<void> {
    await this.updateState(job, {
      changeState: "validating",
      expectedChangeState: "executing",
      expectedJobStatus: "running",
      jobStatus: "validating",
      stage: "validation",
    });
  }

  async addCheckResult(
    job: ClaimedExecutionJob,
    result: WorkerCheckResult,
    sequence: number,
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO realize_ai_check_results
        (execution_job_id, stage, sequence, command, status, started_at, finished_at,
         duration_ms, output_summary, evidence_hash, result_key, updated_at, created_at)
       VALUES ($1, 'execution', $2, $3, $4, $5, $6, $7, $8, $9, $10, now(), now())
       ON CONFLICT (result_key) DO NOTHING`,
      [
        job.id,
        sequence,
        result.command,
        result.status,
        result.startedAt,
        result.finishedAt,
        result.durationMs,
        result.outputSummary,
        result.evidenceHash,
        `${job.executionKey}:${sequence}`,
      ],
    );
  }

  async complete(
    job: ClaimedExecutionJob,
    diff: WorktreeDiff,
    evidenceHash: string,
    workerSummary?: string,
  ): Promise<void> {
    await transaction(this.pool, async (client) => {
      const jobUpdate = await client.query(
        `UPDATE realize_ai_execution_jobs
            SET status = 'completed', stage = 'complete',
                changed_paths = $2::jsonb, diff = $3, diff_hash = $4,
                diff_stat = $5::jsonb, diff_truncated = $6,
                evidence_hash = $7, worker_summary = $8,
                finished_at = now(), updated_at = now()
          WHERE id = $1 AND status = 'validating'`,
        [
          job.id,
          JSON.stringify(diff.changedPaths),
          diff.diff,
          diff.diffHash,
          JSON.stringify(diff.diffStat),
          diff.diffTruncated,
          evidenceHash,
          workerSummary ?? null,
        ],
      );
      const changeUpdate = await client.query(
        `UPDATE realize_ai_change_requests
            SET state = 'changes_ready', version = version + 1, updated_at = now()
          WHERE id = $1 AND state = 'validating'`,
        [job.changeRequestID],
      );
      if (jobUpdate.rowCount !== 1 || changeUpdate.rowCount !== 1) {
        throw new Error("Execution state changed before completion.");
      }
    });
  }

  async fail(
    job: ClaimedExecutionJob,
    input: {
      blocked: boolean;
      summary: string;
      validationFailure: boolean;
      workerSummary?: string;
    },
  ): Promise<void> {
    const jobStatus = input.blocked ? "blocked" : "failed";
    const changeState = input.validationFailure
      ? "validation_failed"
      : "blocked";
    await transaction(this.pool, async (client) => {
      await client.query(
        `UPDATE realize_ai_execution_jobs
            SET status = $2, stage = 'complete', error_summary = $3, worker_summary = $4,
                finished_at = now(), updated_at = now()
          WHERE id = $1`,
        [job.id, jobStatus, input.summary, input.workerSummary ?? null],
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

  private async updateState(
    job: ClaimedExecutionJob,
    input: {
      changeState: string;
      expectedChangeState: string;
      expectedJobStatus: string;
      jobStatus: string;
      stage: string;
    },
  ): Promise<void> {
    await transaction(this.pool, async (client) => {
      const jobUpdate = await client.query(
        `UPDATE realize_ai_execution_jobs
            SET status = $2, stage = $3, updated_at = now()
          WHERE id = $1 AND status = $4`,
        [job.id, input.jobStatus, input.stage, input.expectedJobStatus],
      );
      const changeUpdate = await client.query(
        `UPDATE realize_ai_change_requests
            SET state = $2, version = version + 1, updated_at = now()
          WHERE id = $1 AND state = $3`,
        [job.changeRequestID, input.changeState, input.expectedChangeState],
      );
      if (jobUpdate.rowCount !== 1 || changeUpdate.rowCount !== 1) {
        throw new Error("Execution state transition conflict.");
      }
    });
  }
}
