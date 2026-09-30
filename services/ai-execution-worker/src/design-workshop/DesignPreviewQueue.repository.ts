/**
 * @file services/ai-execution-worker/src/design-workshop/DesignPreviewQueue.repository.ts
 * @version 1.1.0
 * @date 2026-09-26
 * @description Исполняет атомарный claim, lease, fencing и retention очереди preview.
 * @see documentation/specifications/design-workshop.md
 */
import { randomUUID } from "node:crypto";
import type { Pool, QueryResultRow } from "pg";
import {
  DESIGN_PREVIEW,
  designWorkspacePinSchema,
  mcpWorkshopIdentitySchema,
  designPreviewRequestSchema,
  designWorkshopCommands,
  type DesignPreviewErrorCode,
} from "@realize/ai-contracts";
import {
  hashCanonicalJSON,
  validateDesignPreviewArtifact,
  type DesignPreviewArtifact,
} from "@realize/change-engine";
import type {
  ClaimedDesignPreview,
  DesignPreviewJobRow,
} from "./DesignPreviewJob.types";

export class DesignPreviewQueue {
  constructor(private readonly pool: Pool) {}
  /** Timeout принадлежит транзакции этого job owner и не меняет настройки Code Lane connections. */
  private async query<Row extends QueryResultRow = QueryResultRow>(
    text: string,
    values: unknown[] = [],
  ) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "SET LOCAL lock_timeout='3000ms'; SET LOCAL statement_timeout='8000ms'; SET LOCAL idle_in_transaction_session_timeout='10000ms'",
      );
      const result = await client.query<Row>(text, values);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
  async ready(): Promise<boolean> {
    const result = await this.query(
      "SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='realize_design_preview_jobs' AND column_name='mcp_authorization') AS ready",
    );
    return result.rows[0]?.ready === true;
  }
  async cleanup(): Promise<void> {
    await this.query(
      "UPDATE realize_design_preview_jobs SET state='expired', images=NULL, evidence=NULL, lease_token=NULL, lease_until=NULL, updated_at=clock_timestamp() WHERE expires_at <= clock_timestamp() AND (state <> 'expired' OR images IS NOT NULL)",
    );
    await this.query(
      "UPDATE realize_design_preview_jobs SET state='failed', error_code='ATTEMPTS_EXHAUSTED', lease_token=NULL, lease_until=NULL, updated_at=clock_timestamp() WHERE state IN ('queued','running') AND attempt >= $1 AND (lease_until IS NULL OR lease_until <= clock_timestamp())",
      [DESIGN_PREVIEW.attempts],
    );
  }
  async claimNext(
    instanceKey: string,
  ): Promise<ClaimedDesignPreview | undefined> {
    const token = randomUUID();
    const result = await this.query<DesignPreviewJobRow>(
      "WITH candidate AS (SELECT id FROM realize_design_preview_jobs WHERE expires_at > clock_timestamp() AND attempt < $1 AND (state = 'queued' OR (state = 'running' AND lease_until <= clock_timestamp())) ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT 1) UPDATE realize_design_preview_jobs AS jobs SET state='running', attempt=jobs.attempt+1, worker_instance=$2, lease_token=$3, lease_until=clock_timestamp()+$4*INTERVAL '1 second', error_code=NULL, updated_at=clock_timestamp() FROM candidate WHERE jobs.id=candidate.id RETURNING jobs.job_id,jobs.project_id,jobs.revision_id,jobs.requested_by_id,jobs.source_pin,jobs.mcp_authorization,jobs.entry_path,jobs.lease_token,jobs.attempt",
      [
        DESIGN_PREVIEW.attempts,
        instanceKey,
        token,
        DESIGN_PREVIEW.leaseSeconds,
      ],
    );
    const row = result.rows[0];
    if (!row) return undefined;
    const pin = designWorkspacePinSchema.safeParse(row.source_pin);
    const authorization =
      row.mcp_authorization == null
        ? null
        : mcpWorkshopIdentitySchema.safeParse(row.mcp_authorization);
    if (
      (authorization !== null && !authorization.success) ||
      !pin.success ||
      pin.data.projectId !== row.project_id ||
      pin.data.revision.revisionId !== row.revision_id ||
      !designWorkshopCommands.identifier.safeParse(row.job_id).success ||
      row.job_id !== row.job_id.toLowerCase() ||
      !designPreviewRequestSchema.safeParse({
        revisionId: row.revision_id,
        entryPath: row.entry_path,
      }).success
    ) {
      await this.query(
        "UPDATE realize_design_preview_jobs SET state='failed', error_code='SOURCE_INVALID', lease_token=NULL, lease_until=NULL WHERE job_id=$1 AND lease_token=$2",
        [row.job_id, token],
      );
      return undefined;
    }
    return {
      jobId: row.job_id,
      projectId: row.project_id,
      revisionId: row.revision_id,
      actorId: String(row.requested_by_id),
      source: pin.data,
      ...(authorization?.success
        ? { mcpAuthorization: authorization.data }
        : {}),
      entryPath: row.entry_path,
      leaseToken: token,
      attempt: Number(row.attempt),
    };
  }
  async renew(job: ClaimedDesignPreview): Promise<boolean> {
    const result = await this.query(
      "UPDATE realize_design_preview_jobs SET lease_until=clock_timestamp()+$3*INTERVAL '1 second',updated_at=clock_timestamp() WHERE job_id=$1 AND lease_token=$2 AND state='running' AND lease_until>clock_timestamp() AND expires_at>clock_timestamp()",
      [job.jobId, job.leaseToken, DESIGN_PREVIEW.leaseSeconds],
    );
    return result.rowCount === 1;
  }
  async isActive(jobId: string, token: string): Promise<boolean> {
    return (
      (
        await this.query(
          "SELECT 1 FROM realize_design_preview_jobs WHERE job_id=$1 AND lease_token=$2 AND state='running' AND lease_until>clock_timestamp() AND expires_at>clock_timestamp()",
          [jobId, token],
        )
      ).rowCount === 1
    );
  }
  async complete(
    job: ClaimedDesignPreview,
    value: DesignPreviewArtifact,
  ): Promise<boolean> {
    const artifact = validateDesignPreviewArtifact(
      value.evidence,
      value.images,
    );
    if (
      hashCanonicalJSON(job.source) !==
        hashCanonicalJSON(artifact.evidence.source) ||
      artifact.evidence.entryPath !== job.entryPath
    )
      throw Error("Preview source mismatch");
    const result = await this.query(
      "UPDATE realize_design_preview_jobs SET state='completed', evidence=$3::jsonb, images=$4::jsonb, lease_token=NULL, lease_until=NULL, updated_at=clock_timestamp() WHERE job_id=$1 AND lease_token=$2 AND state='running' AND lease_until>clock_timestamp() AND expires_at>clock_timestamp()",
      [
        job.jobId,
        job.leaseToken,
        JSON.stringify(artifact.evidence),
        JSON.stringify(artifact.images),
      ],
    );
    return result.rowCount === 1;
  }
  async fail(
    job: ClaimedDesignPreview,
    error: DesignPreviewErrorCode,
  ): Promise<boolean> {
    const result = await this.query(
      "UPDATE realize_design_preview_jobs SET state='failed',error_code=$3,lease_token=NULL,lease_until=NULL,updated_at=clock_timestamp() WHERE job_id=$1 AND lease_token=$2 AND state='running' AND lease_until>clock_timestamp() AND expires_at>clock_timestamp()",
      [job.jobId, job.leaseToken, error],
    );
    return result.rowCount === 1;
  }
}
