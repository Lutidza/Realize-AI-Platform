/**
 * @file services/ai-execution-worker/src/releaseRepository.ts
 * @version 2026-08-22
 * @description Atomically claims OCI jobs и сохраняет проверенное release evidence.
 */

import type { Pool, PoolClient, QueryResultRow } from "pg";

import type {
  ClaimedReleaseCandidate,
  ReleaseOrchestratorResult,
} from "./releaseTypes";

type ReleaseRow = QueryResultRow & {
  acceptance_artifact_hash: string | null;
  acceptance_bound_hash: string | null;
  acceptance_decision: string | null;
  candidate_key: string;
  change_request_id: number;
  change_state: string;
  deployment_artifact_hash: string | null;
  deployment_commit_s_h_a: string | null;
  deployment_evidence_hash: string | null;
  deployment_expires_at: Date | string;
  deployment_status: string;
  expires_at: Date | string;
  git_commit: string;
  id: number;
  source_acceptance_hash: string;
  source_preview_artifact_hash: string;
  source_preview_evidence_hash: string;
};

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

const invalidReason = (row: ReleaseRow): string | undefined => {
  if (row.change_state !== "release_preparing") {
    return "Change Request state no longer permits release preparation.";
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
    return "Accepted preview evidence no longer matches the release source.";
  }
  if (new Date(row.deployment_expires_at).getTime() <= Date.now()) {
    return "Accepted preview artifact expired before release preparation.";
  }
  if (
    row.acceptance_decision !== "approved" ||
    row.acceptance_bound_hash !== row.source_acceptance_hash ||
    row.acceptance_artifact_hash !== row.source_preview_artifact_hash
  ) {
    return "Preview acceptance no longer matches the release source.";
  }
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    return "Release candidate expired before it was claimed.";
  }
  return undefined;
};

const mapRelease = (row: ReleaseRow): ClaimedReleaseCandidate => ({
  candidateKey: row.candidate_key,
  changeRequestID: row.change_request_id,
  expiresAt: iso(row.expires_at),
  gitCommit: row.git_commit,
  id: row.id,
  sourceAcceptanceHash: row.source_acceptance_hash,
  sourcePreviewArtifactHash: row.source_preview_artifact_hash,
  sourcePreviewEvidenceHash: row.source_preview_evidence_hash,
});

/** PostgreSQL-backed очередь для provider-neutral OCI release worker. */
export class ReleaseWorkerRepository {
  constructor(private readonly pool: Pool) {}

  async claimNext(
    workerID: string,
  ): Promise<ClaimedReleaseCandidate | undefined> {
    return await transaction(this.pool, async (client) => {
      const selected = await client.query<ReleaseRow>(
        `SELECT candidates.*,
                changes.state AS change_state,
                deployments.status AS deployment_status,
                deployments.artifact_hash AS deployment_artifact_hash,
                deployments.commit_s_h_a AS deployment_commit_s_h_a,
                deployments.evidence_hash AS deployment_evidence_hash,
                deployments.expires_at AS deployment_expires_at,
                acceptance.bound_hash AS acceptance_bound_hash,
                acceptance.decision AS acceptance_decision,
                acceptance.artifact_hash AS acceptance_artifact_hash
           FROM realize_ai_release_candidates AS candidates
           JOIN realize_ai_change_requests AS changes
             ON changes.id = candidates.change_request_id
           JOIN realize_ai_deployments AS deployments
             ON deployments.id = candidates.preview_deployment_id
           LEFT JOIN realize_ai_approvals AS acceptance
             ON acceptance.change_request_id = candidates.change_request_id
            AND acceptance.type = 'PREVIEW_ACCEPTANCE'
          WHERE candidates.status = 'queued'
          ORDER BY candidates.created_at ASC
          FOR UPDATE OF candidates, changes, deployments SKIP LOCKED
          LIMIT 1`,
      );
      const row = selected.rows[0];
      if (!row) return undefined;
      const reason = invalidReason(row);
      if (reason) {
        await client.query(
          `UPDATE realize_ai_release_candidates
              SET status = 'blocked', stage = 'complete',
                  error_summary = $2, completed_at = now(), updated_at = now()
            WHERE id = $1`,
          [row.id, reason],
        );
        await client.query(
          `UPDATE realize_ai_change_requests
              SET state = 'blocked', blocked_reason = $2,
                  version = version + 1, updated_at = now()
            WHERE id = $1 AND state = 'release_preparing'`,
          [row.change_request_id, reason],
        );
        return undefined;
      }
      const updated = await client.query(
        `UPDATE realize_ai_release_candidates
            SET status = 'preparing', stage = 'source_validation',
                worker_i_d = $2, attempt = attempt + 1,
                started_at = COALESCE(started_at, now()), updated_at = now()
          WHERE id = $1 AND status = 'queued'`,
        [row.id, workerID],
      );
      if (updated.rowCount !== 1) {
        throw new Error("Release candidate claim conflict.");
      }
      return mapRelease(row);
    });
  }

  async markBuilding(job: ClaimedReleaseCandidate): Promise<void> {
    await this.updateStatus(job.id, "preparing", "building", "build");
  }

  async markScanning(job: ClaimedReleaseCandidate): Promise<void> {
    await this.updateStatus(
      job.id,
      "building",
      "scanning",
      "security_evidence",
    );
  }

  async markDeployingPreview(job: ClaimedReleaseCandidate): Promise<void> {
    await this.updateStatus(
      job.id,
      "scanning",
      "deploying_preview",
      "oci_preview",
    );
  }

  async markVerifyingPreview(job: ClaimedReleaseCandidate): Promise<void> {
    await this.updateStatus(
      job.id,
      "deploying_preview",
      "verifying_preview",
      "oci_preview",
    );
  }

  async complete(
    job: ClaimedReleaseCandidate,
    result: ReleaseOrchestratorResult,
    evidenceHash: string,
  ): Promise<void> {
    await transaction(this.pool, async (client) => {
      const candidate = await client.query(
        `UPDATE realize_ai_release_candidates
            SET status = 'ready', stage = 'complete',
                orchestrator_reference = $2, image_digest = $3, image_ref = $4,
                manifest_hash = $5, sbom_digest = $6, signature_ref = $7,
                signature_verified = true, provenance_ref = $8,
                migrations = $9::jsonb, migration_set_hash = $10,
                config_version = $11, plugin_versions = $12::jsonb,
                preview_u_r_l = $13, preview_status = 'healthy',
                health_summary = $14, evidence_hash = $15,
                completed_at = now(), updated_at = now()
          WHERE id = $1 AND status = 'verifying_preview' AND expires_at > now()`,
        [
          job.id,
          result.orchestratorReference || null,
          result.imageDigest,
          result.imageRef,
          result.manifestHash,
          result.sbomDigest,
          result.signatureRef,
          result.provenanceRef || null,
          JSON.stringify(result.migrations),
          result.migrationSetHash,
          result.configVersion,
          JSON.stringify(result.pluginVersions),
          result.previewURL,
          result.healthSummary,
          evidenceHash,
        ],
      );
      const change = await client.query(
        `UPDATE realize_ai_change_requests
            SET state = 'awaiting_release_approval', blocked_reason = NULL,
                version = version + 1, updated_at = now()
          WHERE id = $1 AND state = 'release_preparing'`,
        [job.changeRequestID],
      );
      if (candidate.rowCount !== 1 || change.rowCount !== 1) {
        throw new Error("Release candidate completion state conflict.");
      }
    });
  }

  async fail(
    job: ClaimedReleaseCandidate,
    input: { blocked: boolean; summary: string },
  ): Promise<void> {
    const status = input.blocked ? "blocked" : "failed";
    const state = input.blocked ? "blocked" : "release_failed";
    await transaction(this.pool, async (client) => {
      await client.query(
        `UPDATE realize_ai_release_candidates
            SET status = $2, stage = 'complete', preview_status = 'unhealthy',
                error_summary = $3, completed_at = now(), updated_at = now()
          WHERE id = $1`,
        [job.id, status, input.summary],
      );
      await client.query(
        `UPDATE realize_ai_change_requests
            SET state = $2, blocked_reason = $3,
                version = version + 1, updated_at = now()
          WHERE id = $1 AND state = 'release_preparing'`,
        [job.changeRequestID, state, input.summary],
      );
    });
  }

  private async updateStatus(
    id: number,
    expectedStatus: string,
    status: string,
    stage: string,
  ): Promise<void> {
    const updated = await this.pool.query(
      `UPDATE realize_ai_release_candidates
          SET status = $2, stage = $3, updated_at = now()
        WHERE id = $1 AND status = $4`,
      [id, status, stage, expectedStatus],
    );
    if (updated.rowCount !== 1) {
      throw new Error("Release candidate state transition conflict.");
    }
  }
}
