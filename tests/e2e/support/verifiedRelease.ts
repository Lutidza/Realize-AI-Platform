/**
 * @file tests/e2e/support/verifiedRelease.ts
 * @version 2026-08-22
 * @description Создаёт exact verified OCI candidate для real Payload API E2E.
 */

import {
  createMigrationSetHash,
  createReleaseEvidenceHash,
} from "@realize/change-engine";

import { withPayloadTestDatabase } from "./payloadAdmin";

export type SeededRelease = {
  imageDigest: string;
  manifestHash: string;
  migrationSetHash: string;
};

/** Создаёт полный accepted-preview → verified-release persistence fixture. */
export const seedVerifiedRelease = async (input: {
  changeRequestID: string;
  userID: number;
}): Promise<SeededRelease> => {
  const changeRequestID = Number(input.changeRequestID);
  const nonce = crypto.randomUUID();
  const gitCommit = "a".repeat(40);
  const sourcePreviewArtifactHash = "b".repeat(64);
  const sourcePreviewEvidenceHash = "c".repeat(64);
  const sourceAcceptanceHash = "d".repeat(64);
  const imageDigest = `sha256:${"e".repeat(64)}`;
  const imageRef = `ghcr.io/realize/e-commerce@${imageDigest}`;
  const manifestHash = "f".repeat(64);
  const sbomDigest = `sha256:${"7".repeat(64)}`;
  const migrations: [] = [];
  const migrationSetHash = createMigrationSetHash(migrations);
  const pluginVersions = { payload: "3.88.0" };
  const candidateKey = `candidate-${nonce}`;
  const configVersion = "payload-config-v1";
  const healthSummary = "Readiness and smoke checks passed.";
  const previewURL = "https://release-api.example.test";
  const provenanceRef = "oci://provenance/release-api";
  const signatureRef = "oci://signature/release-api";
  const evidenceHash = createReleaseEvidenceHash({
    candidateKey,
    configVersion,
    gitCommit,
    healthSummary,
    imageDigest,
    imageRef,
    manifestHash,
    migrationSetHash,
    migrations,
    pluginVersions,
    previewStatus: "healthy",
    previewURL,
    provenanceRef,
    sbomDigest,
    signatureRef,
    signatureVerified: true,
    sourceAcceptanceHash,
    sourcePreviewArtifactHash,
    sourcePreviewEvidenceHash,
  });

  await withPayloadTestDatabase(async (database) => {
    await database.query("BEGIN");
    try {
      await database.query(
        'DELETE FROM "realize_ai_check_results" WHERE "execution_job_id" IN (SELECT "id" FROM "realize_ai_execution_jobs" WHERE "change_request_id" = $1)',
        [changeRequestID],
      );
      await database.query(
        'DELETE FROM "realize_ai_execution_jobs" WHERE "change_request_id" = $1',
        [changeRequestID],
      );
      await database.query(
        `UPDATE "realize_ai_change_requests"
            SET "state" = 'awaiting_release_approval', "version" = 18
          WHERE "id" = $1`,
        [changeRequestID],
      );
      const execution = await database.query<{ id: number }>(
        `INSERT INTO "realize_ai_execution_jobs"
          ("change_request_id", "requested_by_id", "status", "stage", "attempt",
           "execution_key", "idempotency_key", "base_commit", "branch", "workspace_i_d",
           "approved_version", "bound_plan_hash", "bound_scope_hash", "allowed_paths",
           "checks", "capability_nonce", "capability_issued_at", "capability_expires_at",
           "capability_token_hash", "diff_hash", "evidence_hash", "artifacts_expire_at")
         VALUES
          ($1, $2, 'completed', 'complete', 1, $3, $4, $5, $6, $7, 2,
           $8, $9, $10::jsonb, $11::jsonb, $12, now(), $13, $14, $15, $16, $13)
         RETURNING "id"`,
        [
          changeRequestID,
          input.userID,
          `execution:${nonce}`,
          `execution-request:${nonce}`,
          "0".repeat(40),
          `ai/change-${nonce}`,
          `workspace-${nonce}`,
          "1".repeat(64),
          "2".repeat(64),
          JSON.stringify(["src/plugins/index.ts"]),
          JSON.stringify(["npm run typecheck"]),
          `nonce-${nonce}`,
          "2099-01-01T00:00:00.000Z",
          "3".repeat(64),
          "4".repeat(64),
          "5".repeat(64),
        ],
      );
      const deployment = await database.query<{ id: number }>(
        `INSERT INTO "realize_ai_deployments"
          ("change_request_id", "execution_job_id", "initiated_by_id", "environment",
           "status", "runtime_state", "stage", "attempt", "deployment_key",
           "idempotency_key", "base_commit", "source_diff_hash", "source_evidence_hash",
           "bound_implementation_hash", "branch", "workspace_i_d", "required_checks",
           "artifact_kind", "commit_s_h_a", "artifact_hash", "evidence_hash", "expires_at")
         VALUES
          ($1, $2, $3, 'local-preview', 'accepted', 'active', 'complete', 1,
           $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, 'local-git-preview',
           $13, $14, $15, $16)
         RETURNING "id"`,
        [
          changeRequestID,
          execution.rows[0]!.id,
          input.userID,
          `deployment:${nonce}`,
          `deployment-request:${nonce}`,
          "0".repeat(40),
          "4".repeat(64),
          "5".repeat(64),
          "6".repeat(64),
          `ai/preview-${nonce}`,
          `preview-workspace-${nonce}`,
          JSON.stringify(["npm run typecheck"]),
          gitCommit,
          sourcePreviewArtifactHash,
          sourcePreviewEvidenceHash,
          "2099-01-01T00:00:00.000Z",
        ],
      );
      await database.query(
        `INSERT INTO "realize_ai_approvals"
          ("change_request_id", "type", "decision", "actor_id", "role_snapshot",
           "bound_hash", "artifact_hash", "expires_at", "decision_key", "idempotency_key")
         VALUES ($1, 'PREVIEW_ACCEPTANCE', 'approved', $2, '["admin"]'::jsonb,
                 $3, $4, $5, $6, $7)`,
        [
          changeRequestID,
          input.userID,
          sourceAcceptanceHash,
          sourcePreviewArtifactHash,
          "2099-01-01T00:00:00.000Z",
          `preview-acceptance:${nonce}`,
          `preview-acceptance-request:${nonce}`,
        ],
      );
      await database.query(
        `INSERT INTO "realize_ai_release_candidates"
          ("change_request_id", "preview_deployment_id", "initiated_by_id", "environment",
           "target_environment", "artifact_kind", "status", "stage", "attempt",
           "candidate_key", "idempotency_key", "source_preview_artifact_hash",
           "source_preview_evidence_hash", "source_acceptance_hash", "git_commit",
           "image_digest", "image_ref", "manifest_hash", "sbom_digest", "signature_ref",
           "signature_verified", "provenance_ref", "migrations", "migration_set_hash",
           "config_version", "plugin_versions", "preview_u_r_l", "preview_status",
           "health_summary", "evidence_hash", "expires_at")
         VALUES
          ($1, $2, $3, 'oci-preview', 'production', 'oci-image', 'ready', 'complete', 1,
           $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, true, $15,
           $16::jsonb, $17, $18, $19::jsonb, $20, 'healthy', $21, $22, $23)`,
        [
          changeRequestID,
          deployment.rows[0]!.id,
          input.userID,
          candidateKey,
          `candidate-request:${nonce}`,
          sourcePreviewArtifactHash,
          sourcePreviewEvidenceHash,
          sourceAcceptanceHash,
          gitCommit,
          imageDigest,
          imageRef,
          manifestHash,
          sbomDigest,
          signatureRef,
          provenanceRef,
          JSON.stringify(migrations),
          migrationSetHash,
          configVersion,
          JSON.stringify(pluginVersions),
          previewURL,
          healthSummary,
          evidenceHash,
          "2099-01-01T00:00:00.000Z",
        ],
      );
      await database.query("COMMIT");
    } catch (cause) {
      await database.query("ROLLBACK");
      throw cause;
    }
  });

  return { imageDigest, manifestHash, migrationSetHash };
};
