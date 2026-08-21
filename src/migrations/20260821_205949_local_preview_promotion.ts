import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_realize_ai_deployments_environment" AS ENUM('local-preview');
  CREATE TYPE "public"."enum_realize_ai_deployments_status" AS ENUM('queued', 'preparing_workspace', 'running_checks', 'reviewing', 'committing', 'starting_preview', 'ready', 'accepted', 'rejected', 'failed', 'blocked', 'cancelled', 'expired');
  CREATE TYPE "public"."enum_realize_ai_deployments_runtime_state" AS ENUM('pending', 'active', 'stopped');
  CREATE TYPE "public"."enum_realize_ai_deployments_stage" AS ENUM('queued', 'workspace_preparation', 'validation', 'independent_review', 'commit', 'preview_startup', 'complete');
  CREATE TYPE "public"."enum_realize_ai_deployments_artifact_kind" AS ENUM('local-git-preview');
  CREATE TYPE "public"."enum_realize_ai_deployments_review_status" AS ENUM('approved', 'changes_requested');
  CREATE TYPE "public"."enum_realize_ai_check_results_stage" AS ENUM('execution', 'preview_validation', 'preview_smoke');
  ALTER TYPE "public"."enum_realize_ai_change_requests_state" ADD VALUE 'preview_queued' BEFORE 'blocked';
  ALTER TYPE "public"."enum_realize_ai_change_requests_state" ADD VALUE 'preview_preparing' BEFORE 'blocked';
  ALTER TYPE "public"."enum_realize_ai_change_requests_state" ADD VALUE 'preview_validating' BEFORE 'blocked';
  ALTER TYPE "public"."enum_realize_ai_change_requests_state" ADD VALUE 'preview_reviewing' BEFORE 'blocked';
  ALTER TYPE "public"."enum_realize_ai_change_requests_state" ADD VALUE 'preview_committing' BEFORE 'blocked';
  ALTER TYPE "public"."enum_realize_ai_change_requests_state" ADD VALUE 'preview_starting' BEFORE 'blocked';
  ALTER TYPE "public"."enum_realize_ai_change_requests_state" ADD VALUE 'preview_ready' BEFORE 'blocked';
  ALTER TYPE "public"."enum_realize_ai_change_requests_state" ADD VALUE 'preview_accepted' BEFORE 'blocked';
  ALTER TYPE "public"."enum_realize_ai_change_requests_state" ADD VALUE 'preview_failed' BEFORE 'blocked';
  ALTER TYPE "public"."enum_realize_ai_approvals_type" ADD VALUE 'PREVIEW_ACCEPTANCE';
  CREATE TABLE "realize_ai_deployments" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"change_request_id" integer NOT NULL,
  	"execution_job_id" integer NOT NULL,
  	"initiated_by_id" integer NOT NULL,
  	"environment" "enum_realize_ai_deployments_environment" DEFAULT 'local-preview' NOT NULL,
  	"status" "enum_realize_ai_deployments_status" NOT NULL,
  	"runtime_state" "enum_realize_ai_deployments_runtime_state" DEFAULT 'pending' NOT NULL,
  	"stage" "enum_realize_ai_deployments_stage" NOT NULL,
  	"attempt" numeric DEFAULT 0 NOT NULL,
  	"deployment_key" varchar NOT NULL,
  	"idempotency_key" varchar NOT NULL,
  	"base_commit" varchar NOT NULL,
  	"source_diff_hash" varchar NOT NULL,
  	"source_evidence_hash" varchar NOT NULL,
  	"bound_implementation_hash" varchar NOT NULL,
  	"branch" varchar NOT NULL,
  	"workspace_i_d" varchar NOT NULL,
  	"required_checks" jsonb NOT NULL,
  	"worker_i_d" varchar,
  	"artifact_kind" "enum_realize_ai_deployments_artifact_kind" DEFAULT 'local-git-preview' NOT NULL,
  	"commit_s_h_a" varchar,
  	"tree_hash" varchar,
  	"artifact_hash" varchar,
  	"evidence_hash" varchar,
  	"review_status" "enum_realize_ai_deployments_review_status",
  	"review_summary" varchar,
  	"review_findings" jsonb,
  	"review_evidence_hash" varchar,
  	"review_model" varchar,
  	"review_completed_at" timestamp(3) with time zone,
  	"preview_u_r_l" varchar,
  	"health_summary" varchar,
  	"error_summary" varchar,
  	"database_name" varchar,
  	"process_i_d" numeric,
  	"started_at" timestamp(3) with time zone,
  	"completed_at" timestamp(3) with time zone,
  	"expires_at" timestamp(3) with time zone NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "realize_ai_check_results" ALTER COLUMN "execution_job_id" DROP NOT NULL;
  ALTER TABLE "realize_ai_approvals" ADD COLUMN "artifact_hash" varchar;
  ALTER TABLE "realize_ai_approvals" ADD COLUMN "target_environment" varchar;
  ALTER TABLE "realize_ai_check_results" ADD COLUMN "deployment_id" integer;
  ALTER TABLE "realize_ai_check_results" ADD COLUMN "stage" "enum_realize_ai_check_results_stage" DEFAULT 'execution' NOT NULL;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "realize_ai_deployments_id" integer;
  ALTER TABLE "realize_ai_deployments" ADD CONSTRAINT "realize_ai_deployments_change_request_id_realize_ai_change_requests_id_fk" FOREIGN KEY ("change_request_id") REFERENCES "public"."realize_ai_change_requests"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "realize_ai_deployments" ADD CONSTRAINT "realize_ai_deployments_execution_job_id_realize_ai_execution_jobs_id_fk" FOREIGN KEY ("execution_job_id") REFERENCES "public"."realize_ai_execution_jobs"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "realize_ai_deployments" ADD CONSTRAINT "realize_ai_deployments_initiated_by_id_users_id_fk" FOREIGN KEY ("initiated_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "realize_ai_deployments_change_request_idx" ON "realize_ai_deployments" USING btree ("change_request_id");
  CREATE INDEX "realize_ai_deployments_execution_job_idx" ON "realize_ai_deployments" USING btree ("execution_job_id");
  CREATE INDEX "realize_ai_deployments_initiated_by_idx" ON "realize_ai_deployments" USING btree ("initiated_by_id");
  CREATE INDEX "realize_ai_deployments_environment_idx" ON "realize_ai_deployments" USING btree ("environment");
  CREATE INDEX "realize_ai_deployments_status_idx" ON "realize_ai_deployments" USING btree ("status");
  CREATE INDEX "realize_ai_deployments_runtime_state_idx" ON "realize_ai_deployments" USING btree ("runtime_state");
  CREATE UNIQUE INDEX "realize_ai_deployments_deployment_key_idx" ON "realize_ai_deployments" USING btree ("deployment_key");
  CREATE UNIQUE INDEX "realize_ai_deployments_idempotency_key_idx" ON "realize_ai_deployments" USING btree ("idempotency_key");
  CREATE INDEX "realize_ai_deployments_base_commit_idx" ON "realize_ai_deployments" USING btree ("base_commit");
  CREATE INDEX "realize_ai_deployments_source_diff_hash_idx" ON "realize_ai_deployments" USING btree ("source_diff_hash");
  CREATE INDEX "realize_ai_deployments_source_evidence_hash_idx" ON "realize_ai_deployments" USING btree ("source_evidence_hash");
  CREATE INDEX "realize_ai_deployments_bound_implementation_hash_idx" ON "realize_ai_deployments" USING btree ("bound_implementation_hash");
  CREATE UNIQUE INDEX "realize_ai_deployments_branch_idx" ON "realize_ai_deployments" USING btree ("branch");
  CREATE UNIQUE INDEX "realize_ai_deployments_workspace_i_d_idx" ON "realize_ai_deployments" USING btree ("workspace_i_d");
  CREATE INDEX "realize_ai_deployments_commit_s_h_a_idx" ON "realize_ai_deployments" USING btree ("commit_s_h_a");
  CREATE INDEX "realize_ai_deployments_tree_hash_idx" ON "realize_ai_deployments" USING btree ("tree_hash");
  CREATE INDEX "realize_ai_deployments_artifact_hash_idx" ON "realize_ai_deployments" USING btree ("artifact_hash");
  CREATE INDEX "realize_ai_deployments_evidence_hash_idx" ON "realize_ai_deployments" USING btree ("evidence_hash");
  CREATE INDEX "realize_ai_deployments_review_evidence_hash_idx" ON "realize_ai_deployments" USING btree ("review_evidence_hash");
  CREATE INDEX "realize_ai_deployments_expires_at_idx" ON "realize_ai_deployments" USING btree ("expires_at");
  CREATE INDEX "realize_ai_deployments_updated_at_idx" ON "realize_ai_deployments" USING btree ("updated_at");
  CREATE INDEX "realize_ai_deployments_created_at_idx" ON "realize_ai_deployments" USING btree ("created_at");
  ALTER TABLE "realize_ai_check_results" ADD CONSTRAINT "realize_ai_check_results_deployment_id_realize_ai_deployments_id_fk" FOREIGN KEY ("deployment_id") REFERENCES "public"."realize_ai_deployments"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "realize_ai_check_results" ADD CONSTRAINT "realize_ai_check_results_exactly_one_owner" CHECK (("execution_job_id" IS NOT NULL) <> ("deployment_id" IS NOT NULL));
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_realize_ai_deployments_fk" FOREIGN KEY ("realize_ai_deployments_id") REFERENCES "public"."realize_ai_deployments"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "realize_ai_approvals_artifact_hash_idx" ON "realize_ai_approvals" USING btree ("artifact_hash");
  CREATE INDEX "realize_ai_check_results_deployment_idx" ON "realize_ai_check_results" USING btree ("deployment_id");
  CREATE INDEX "realize_ai_check_results_stage_idx" ON "realize_ai_check_results" USING btree ("stage");
  CREATE INDEX "payload_locked_documents_rels_realize_ai_deployments_id_idx" ON "payload_locked_documents_rels" USING btree ("realize_ai_deployments_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DELETE FROM "realize_ai_check_results" WHERE "deployment_id" IS NOT NULL;
  DELETE FROM "realize_ai_approvals" WHERE "type" = 'PREVIEW_ACCEPTANCE';
  UPDATE "realize_ai_change_requests"
     SET "state" = CASE
       WHEN "state" = 'preview_failed' THEN 'blocked'::"public"."enum_realize_ai_change_requests_state"
       ELSE 'changes_accepted'::"public"."enum_realize_ai_change_requests_state"
     END
   WHERE "state" IN (
     'preview_queued',
     'preview_preparing',
     'preview_validating',
     'preview_reviewing',
     'preview_committing',
     'preview_starting',
     'preview_ready',
     'preview_accepted',
     'preview_failed'
   );
  ALTER TABLE "realize_ai_check_results" DROP CONSTRAINT "realize_ai_check_results_exactly_one_owner";
  ALTER TABLE "realize_ai_check_results" DROP CONSTRAINT "realize_ai_check_results_deployment_id_realize_ai_deployments_id_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_realize_ai_deployments_fk";
  
  ALTER TABLE "realize_ai_deployments" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "realize_ai_deployments" CASCADE;
  
  ALTER TABLE "realize_ai_change_requests" ALTER COLUMN "state" SET DATA TYPE text;
  DROP TYPE "public"."enum_realize_ai_change_requests_state";
  CREATE TYPE "public"."enum_realize_ai_change_requests_state" AS ENUM('awaiting_plan_approval', 'plan_approved', 'execution_queued', 'workspace_preparing', 'executing', 'validating', 'validation_failed', 'changes_ready', 'changes_accepted', 'blocked');
  ALTER TABLE "realize_ai_change_requests" ALTER COLUMN "state" SET DATA TYPE "public"."enum_realize_ai_change_requests_state" USING "state"::"public"."enum_realize_ai_change_requests_state";
  ALTER TABLE "realize_ai_approvals" ALTER COLUMN "type" SET DATA TYPE text;
  ALTER TABLE "realize_ai_approvals" ALTER COLUMN "type" SET DEFAULT 'PLAN_APPROVAL'::text;
  DROP TYPE "public"."enum_realize_ai_approvals_type";
  CREATE TYPE "public"."enum_realize_ai_approvals_type" AS ENUM('PLAN_APPROVAL', 'IMPLEMENTATION_ACCEPTANCE');
  ALTER TABLE "realize_ai_approvals" ALTER COLUMN "type" SET DEFAULT 'PLAN_APPROVAL'::"public"."enum_realize_ai_approvals_type";
  ALTER TABLE "realize_ai_approvals" ALTER COLUMN "type" SET DATA TYPE "public"."enum_realize_ai_approvals_type" USING "type"::"public"."enum_realize_ai_approvals_type";
  DROP INDEX "realize_ai_approvals_artifact_hash_idx";
  DROP INDEX "realize_ai_check_results_deployment_idx";
  DROP INDEX "realize_ai_check_results_stage_idx";
  DROP INDEX "payload_locked_documents_rels_realize_ai_deployments_id_idx";
  ALTER TABLE "realize_ai_check_results" ALTER COLUMN "execution_job_id" SET NOT NULL;
  ALTER TABLE "realize_ai_approvals" DROP COLUMN "artifact_hash";
  ALTER TABLE "realize_ai_approvals" DROP COLUMN "target_environment";
  ALTER TABLE "realize_ai_check_results" DROP COLUMN "deployment_id";
  ALTER TABLE "realize_ai_check_results" DROP COLUMN "stage";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "realize_ai_deployments_id";
  DROP TYPE "public"."enum_realize_ai_deployments_environment";
  DROP TYPE "public"."enum_realize_ai_deployments_status";
  DROP TYPE "public"."enum_realize_ai_deployments_runtime_state";
  DROP TYPE "public"."enum_realize_ai_deployments_stage";
  DROP TYPE "public"."enum_realize_ai_deployments_artifact_kind";
  DROP TYPE "public"."enum_realize_ai_deployments_review_status";
  DROP TYPE "public"."enum_realize_ai_check_results_stage";`)
}
