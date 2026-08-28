import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_realize_ai_release_candidates_environment" AS ENUM('oci-preview');
  CREATE TYPE "public"."enum_realize_ai_release_candidates_target_environment" AS ENUM('production');
  CREATE TYPE "public"."enum_realize_ai_release_candidates_artifact_kind" AS ENUM('oci-image');
  CREATE TYPE "public"."enum_realize_ai_release_candidates_status" AS ENUM('queued', 'preparing', 'building', 'scanning', 'deploying_preview', 'verifying_preview', 'ready', 'approved', 'rejected', 'failed', 'blocked', 'expired');
  CREATE TYPE "public"."enum_realize_ai_release_candidates_stage" AS ENUM('queued', 'source_validation', 'build', 'security_evidence', 'oci_preview', 'complete');
  CREATE TYPE "public"."enum_realize_ai_release_candidates_preview_status" AS ENUM('pending', 'healthy', 'unhealthy');
  ALTER TYPE "public"."enum_realize_ai_change_requests_state" ADD VALUE 'release_preparing' BEFORE 'blocked';
  ALTER TYPE "public"."enum_realize_ai_change_requests_state" ADD VALUE 'awaiting_release_approval' BEFORE 'blocked';
  ALTER TYPE "public"."enum_realize_ai_change_requests_state" ADD VALUE 'release_approved' BEFORE 'blocked';
  ALTER TYPE "public"."enum_realize_ai_change_requests_state" ADD VALUE 'release_failed' BEFORE 'blocked';
  ALTER TYPE "public"."enum_realize_ai_approvals_type" ADD VALUE 'RELEASE_APPROVAL';
  CREATE TABLE "realize_ai_release_candidates" (
	"id" serial PRIMARY KEY NOT NULL,
	"change_request_id" integer NOT NULL,
	"preview_deployment_id" integer NOT NULL,
	"initiated_by_id" integer NOT NULL,
	"environment" "enum_realize_ai_release_candidates_environment" DEFAULT 'oci-preview' NOT NULL,
	"target_environment" "enum_realize_ai_release_candidates_target_environment" DEFAULT 'production' NOT NULL,
	"artifact_kind" "enum_realize_ai_release_candidates_artifact_kind" DEFAULT 'oci-image' NOT NULL,
	"status" "enum_realize_ai_release_candidates_status" NOT NULL,
	"stage" "enum_realize_ai_release_candidates_stage" NOT NULL,
	"attempt" numeric DEFAULT 0 NOT NULL,
	"candidate_key" varchar NOT NULL,
	"idempotency_key" varchar NOT NULL,
	"source_preview_artifact_hash" varchar NOT NULL,
	"source_preview_evidence_hash" varchar NOT NULL,
	"source_acceptance_hash" varchar NOT NULL,
	"git_commit" varchar NOT NULL,
	"worker_i_d" varchar,
	"orchestrator_reference" varchar,
	"image_digest" varchar,
	"image_ref" varchar,
	"manifest_hash" varchar,
	"sbom_digest" varchar,
	"signature_ref" varchar,
	"signature_verified" boolean DEFAULT false NOT NULL,
	"provenance_ref" varchar,
	"migrations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"migration_set_hash" varchar,
	"config_version" varchar,
	"plugin_versions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"preview_u_r_l" varchar,
	"preview_status" "enum_realize_ai_release_candidates_preview_status" DEFAULT 'pending' NOT NULL,
	"health_summary" varchar,
	"evidence_hash" varchar,
	"error_summary" varchar,
	"started_at" timestamp(3) with time zone,
	"completed_at" timestamp(3) with time zone,
	"expires_at" timestamp(3) with time zone NOT NULL,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  ALTER TABLE "realize_ai_approvals" ADD COLUMN "release_candidate_id" integer;
  ALTER TABLE "realize_ai_approvals" ADD COLUMN "image_digest" varchar;
  ALTER TABLE "realize_ai_approvals" ADD COLUMN "manifest_hash" varchar;
  ALTER TABLE "realize_ai_approvals" ADD COLUMN "migration_set_hash" varchar;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "realize_ai_release_candidates_id" integer;
  ALTER TABLE "realize_ai_release_candidates" ADD CONSTRAINT "realize_ai_release_candidates_change_request_id_realize_ai_change_requests_id_fk" FOREIGN KEY ("change_request_id") REFERENCES "public"."realize_ai_change_requests"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "realize_ai_release_candidates" ADD CONSTRAINT "realize_ai_release_candidates_preview_deployment_id_realize_ai_deployments_id_fk" FOREIGN KEY ("preview_deployment_id") REFERENCES "public"."realize_ai_deployments"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "realize_ai_release_candidates" ADD CONSTRAINT "realize_ai_release_candidates_initiated_by_id_users_id_fk" FOREIGN KEY ("initiated_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "realize_ai_release_candidates_change_request_idx" ON "realize_ai_release_candidates" USING btree ("change_request_id");
  CREATE INDEX "realize_ai_release_candidates_preview_deployment_idx" ON "realize_ai_release_candidates" USING btree ("preview_deployment_id");
  CREATE INDEX "realize_ai_release_candidates_initiated_by_idx" ON "realize_ai_release_candidates" USING btree ("initiated_by_id");
  CREATE INDEX "realize_ai_release_candidates_environment_idx" ON "realize_ai_release_candidates" USING btree ("environment");
  CREATE INDEX "realize_ai_release_candidates_target_environment_idx" ON "realize_ai_release_candidates" USING btree ("target_environment");
  CREATE INDEX "realize_ai_release_candidates_status_idx" ON "realize_ai_release_candidates" USING btree ("status");
  CREATE UNIQUE INDEX "realize_ai_release_candidates_candidate_key_idx" ON "realize_ai_release_candidates" USING btree ("candidate_key");
  CREATE UNIQUE INDEX "realize_ai_release_candidates_idempotency_key_idx" ON "realize_ai_release_candidates" USING btree ("idempotency_key");
  CREATE INDEX "realize_ai_release_candidates_source_preview_artifact_ha_idx" ON "realize_ai_release_candidates" USING btree ("source_preview_artifact_hash");
  CREATE INDEX "realize_ai_release_candidates_source_preview_evidence_ha_idx" ON "realize_ai_release_candidates" USING btree ("source_preview_evidence_hash");
  CREATE INDEX "realize_ai_release_candidates_source_acceptance_hash_idx" ON "realize_ai_release_candidates" USING btree ("source_acceptance_hash");
  CREATE INDEX "realize_ai_release_candidates_git_commit_idx" ON "realize_ai_release_candidates" USING btree ("git_commit");
  CREATE INDEX "realize_ai_release_candidates_image_digest_idx" ON "realize_ai_release_candidates" USING btree ("image_digest");
  CREATE INDEX "realize_ai_release_candidates_manifest_hash_idx" ON "realize_ai_release_candidates" USING btree ("manifest_hash");
  CREATE INDEX "realize_ai_release_candidates_sbom_digest_idx" ON "realize_ai_release_candidates" USING btree ("sbom_digest");
  CREATE INDEX "realize_ai_release_candidates_migration_set_hash_idx" ON "realize_ai_release_candidates" USING btree ("migration_set_hash");
  CREATE INDEX "realize_ai_release_candidates_evidence_hash_idx" ON "realize_ai_release_candidates" USING btree ("evidence_hash");
  CREATE INDEX "realize_ai_release_candidates_expires_at_idx" ON "realize_ai_release_candidates" USING btree ("expires_at");
  CREATE INDEX "realize_ai_release_candidates_updated_at_idx" ON "realize_ai_release_candidates" USING btree ("updated_at");
  CREATE INDEX "realize_ai_release_candidates_created_at_idx" ON "realize_ai_release_candidates" USING btree ("created_at");
  ALTER TABLE "realize_ai_approvals" ADD CONSTRAINT "realize_ai_approvals_release_candidate_id_realize_ai_release_candidates_id_fk" FOREIGN KEY ("release_candidate_id") REFERENCES "public"."realize_ai_release_candidates"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_realize_ai_release_candidat_fk" FOREIGN KEY ("realize_ai_release_candidates_id") REFERENCES "public"."realize_ai_release_candidates"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "realize_ai_approvals_release_candidate_idx" ON "realize_ai_approvals" USING btree ("release_candidate_id");
  CREATE INDEX "realize_ai_approvals_image_digest_idx" ON "realize_ai_approvals" USING btree ("image_digest");
  CREATE INDEX "realize_ai_approvals_manifest_hash_idx" ON "realize_ai_approvals" USING btree ("manifest_hash");
  CREATE INDEX "realize_ai_approvals_migration_set_hash_idx" ON "realize_ai_approvals" USING btree ("migration_set_hash");
  CREATE INDEX "payload_locked_documents_rels_realize_ai_release_candida_idx" ON "payload_locked_documents_rels" USING btree ("realize_ai_release_candidates_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DELETE FROM "realize_ai_approvals" WHERE "type" = 'RELEASE_APPROVAL';
  UPDATE "realize_ai_change_requests"
     SET "state" = CASE
       WHEN "state" = 'release_failed' THEN 'blocked'::"public"."enum_realize_ai_change_requests_state"
       ELSE 'preview_accepted'::"public"."enum_realize_ai_change_requests_state"
     END
   WHERE "state" IN (
     'release_preparing',
     'awaiting_release_approval',
     'release_approved',
     'release_failed'
   );
  ALTER TABLE "realize_ai_approvals" DROP CONSTRAINT "realize_ai_approvals_release_candidate_id_realize_ai_release_candidates_id_fk";

  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_realize_ai_release_candidat_fk";
  ALTER TABLE "realize_ai_release_candidates" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "realize_ai_release_candidates" CASCADE;

  ALTER TABLE "realize_ai_change_requests" ALTER COLUMN "state" SET DATA TYPE text;
  DROP TYPE "public"."enum_realize_ai_change_requests_state";
  CREATE TYPE "public"."enum_realize_ai_change_requests_state" AS ENUM('awaiting_plan_approval', 'plan_approved', 'execution_queued', 'workspace_preparing', 'executing', 'validating', 'validation_failed', 'changes_ready', 'changes_accepted', 'preview_queued', 'preview_preparing', 'preview_validating', 'preview_reviewing', 'preview_committing', 'preview_starting', 'preview_ready', 'preview_accepted', 'preview_failed', 'blocked');
  ALTER TABLE "realize_ai_change_requests" ALTER COLUMN "state" SET DATA TYPE "public"."enum_realize_ai_change_requests_state" USING "state"::"public"."enum_realize_ai_change_requests_state";
  ALTER TABLE "realize_ai_approvals" ALTER COLUMN "type" SET DATA TYPE text;
  ALTER TABLE "realize_ai_approvals" ALTER COLUMN "type" SET DEFAULT 'PLAN_APPROVAL'::text;
  DROP TYPE "public"."enum_realize_ai_approvals_type";
  CREATE TYPE "public"."enum_realize_ai_approvals_type" AS ENUM('PLAN_APPROVAL', 'IMPLEMENTATION_ACCEPTANCE', 'PREVIEW_ACCEPTANCE');
  ALTER TABLE "realize_ai_approvals" ALTER COLUMN "type" SET DEFAULT 'PLAN_APPROVAL'::"public"."enum_realize_ai_approvals_type";
  ALTER TABLE "realize_ai_approvals" ALTER COLUMN "type" SET DATA TYPE "public"."enum_realize_ai_approvals_type" USING "type"::"public"."enum_realize_ai_approvals_type";
  DROP INDEX "realize_ai_approvals_release_candidate_idx";
  DROP INDEX "realize_ai_approvals_image_digest_idx";
  DROP INDEX "realize_ai_approvals_manifest_hash_idx";
  DROP INDEX "realize_ai_approvals_migration_set_hash_idx";
  DROP INDEX "payload_locked_documents_rels_realize_ai_release_candida_idx";
  ALTER TABLE "realize_ai_approvals" DROP COLUMN "release_candidate_id";
  ALTER TABLE "realize_ai_approvals" DROP COLUMN "image_digest";
  ALTER TABLE "realize_ai_approvals" DROP COLUMN "manifest_hash";
  ALTER TABLE "realize_ai_approvals" DROP COLUMN "migration_set_hash";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "realize_ai_release_candidates_id";
  DROP TYPE "public"."enum_realize_ai_release_candidates_environment";
  DROP TYPE "public"."enum_realize_ai_release_candidates_target_environment";
  DROP TYPE "public"."enum_realize_ai_release_candidates_artifact_kind";
  DROP TYPE "public"."enum_realize_ai_release_candidates_status";
  DROP TYPE "public"."enum_realize_ai_release_candidates_stage";
  DROP TYPE "public"."enum_realize_ai_release_candidates_preview_status";`)
}
