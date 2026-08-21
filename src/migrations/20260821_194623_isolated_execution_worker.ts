import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_realize_ai_approvals_type" AS ENUM('PLAN_APPROVAL', 'IMPLEMENTATION_ACCEPTANCE');
  CREATE TYPE "public"."enum_realize_ai_execution_jobs_status" AS ENUM('queued', 'preparing_workspace', 'running', 'validating', 'completed', 'failed', 'blocked', 'cancelled');
  CREATE TYPE "public"."enum_realize_ai_execution_jobs_stage" AS ENUM('queued', 'workspace_preparation', 'implementation', 'validation', 'complete');
  CREATE TYPE "public"."enum_realize_ai_check_results_status" AS ENUM('passed', 'failed');
  ALTER TYPE "public"."enum_realize_ai_change_requests_state" ADD VALUE 'execution_queued' BEFORE 'blocked';
  ALTER TYPE "public"."enum_realize_ai_change_requests_state" ADD VALUE 'workspace_preparing' BEFORE 'blocked';
  ALTER TYPE "public"."enum_realize_ai_change_requests_state" ADD VALUE 'executing' BEFORE 'blocked';
  ALTER TYPE "public"."enum_realize_ai_change_requests_state" ADD VALUE 'validating' BEFORE 'blocked';
  ALTER TYPE "public"."enum_realize_ai_change_requests_state" ADD VALUE 'validation_failed' BEFORE 'blocked';
  ALTER TYPE "public"."enum_realize_ai_change_requests_state" ADD VALUE 'changes_ready' BEFORE 'blocked';
  ALTER TYPE "public"."enum_realize_ai_change_requests_state" ADD VALUE 'changes_accepted' BEFORE 'blocked';
  CREATE TABLE "realize_ai_execution_jobs" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"change_request_id" integer NOT NULL,
  	"requested_by_id" integer NOT NULL,
  	"status" "enum_realize_ai_execution_jobs_status" NOT NULL,
  	"stage" "enum_realize_ai_execution_jobs_stage" NOT NULL,
  	"attempt" numeric DEFAULT 0 NOT NULL,
  	"execution_key" varchar NOT NULL,
  	"idempotency_key" varchar NOT NULL,
  	"base_commit" varchar NOT NULL,
  	"branch" varchar NOT NULL,
  	"workspace_i_d" varchar NOT NULL,
  	"approved_version" numeric NOT NULL,
  	"bound_plan_hash" varchar NOT NULL,
  	"bound_scope_hash" varchar NOT NULL,
  	"allowed_paths" jsonb NOT NULL,
  	"checks" jsonb NOT NULL,
  	"capability_nonce" varchar NOT NULL,
  	"capability_issued_at" timestamp(3) with time zone NOT NULL,
  	"capability_expires_at" timestamp(3) with time zone NOT NULL,
  	"capability_token_hash" varchar NOT NULL,
  	"worker_i_d" varchar,
  	"changed_paths" jsonb,
  	"diff" varchar,
  	"diff_hash" varchar,
  	"diff_stat" jsonb,
  	"diff_truncated" boolean DEFAULT false NOT NULL,
  	"evidence_hash" varchar,
  	"worker_summary" varchar,
  	"error_summary" varchar,
  	"started_at" timestamp(3) with time zone,
  	"finished_at" timestamp(3) with time zone,
  	"artifacts_expire_at" timestamp(3) with time zone NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "realize_ai_check_results" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"execution_job_id" integer NOT NULL,
  	"sequence" numeric NOT NULL,
  	"command" varchar NOT NULL,
  	"status" "enum_realize_ai_check_results_status" NOT NULL,
  	"started_at" timestamp(3) with time zone NOT NULL,
  	"finished_at" timestamp(3) with time zone NOT NULL,
  	"duration_ms" numeric NOT NULL,
  	"output_summary" varchar,
  	"evidence_hash" varchar NOT NULL,
  	"result_key" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  ALTER TABLE "realize_ai_approvals" ALTER COLUMN "type" SET DEFAULT 'PLAN_APPROVAL'::"public"."enum_realize_ai_approvals_type";
  ALTER TABLE "realize_ai_approvals" ALTER COLUMN "type" SET DATA TYPE "public"."enum_realize_ai_approvals_type" USING "type"::"public"."enum_realize_ai_approvals_type";
  ALTER TABLE "realize_ai_approvals" ADD COLUMN "diff_hash" varchar;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "realize_ai_execution_jobs_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "realize_ai_check_results_id" integer;
  ALTER TABLE "realize_ai_execution_jobs" ADD CONSTRAINT "realize_ai_execution_jobs_change_request_id_realize_ai_change_requests_id_fk" FOREIGN KEY ("change_request_id") REFERENCES "public"."realize_ai_change_requests"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "realize_ai_execution_jobs" ADD CONSTRAINT "realize_ai_execution_jobs_requested_by_id_users_id_fk" FOREIGN KEY ("requested_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "realize_ai_check_results" ADD CONSTRAINT "realize_ai_check_results_execution_job_id_realize_ai_execution_jobs_id_fk" FOREIGN KEY ("execution_job_id") REFERENCES "public"."realize_ai_execution_jobs"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "realize_ai_execution_jobs_change_request_idx" ON "realize_ai_execution_jobs" USING btree ("change_request_id");
  CREATE INDEX "realize_ai_execution_jobs_requested_by_idx" ON "realize_ai_execution_jobs" USING btree ("requested_by_id");
  CREATE INDEX "realize_ai_execution_jobs_status_idx" ON "realize_ai_execution_jobs" USING btree ("status");
  CREATE UNIQUE INDEX "realize_ai_execution_jobs_execution_key_idx" ON "realize_ai_execution_jobs" USING btree ("execution_key");
  CREATE UNIQUE INDEX "realize_ai_execution_jobs_idempotency_key_idx" ON "realize_ai_execution_jobs" USING btree ("idempotency_key");
  CREATE INDEX "realize_ai_execution_jobs_base_commit_idx" ON "realize_ai_execution_jobs" USING btree ("base_commit");
  CREATE UNIQUE INDEX "realize_ai_execution_jobs_branch_idx" ON "realize_ai_execution_jobs" USING btree ("branch");
  CREATE UNIQUE INDEX "realize_ai_execution_jobs_workspace_i_d_idx" ON "realize_ai_execution_jobs" USING btree ("workspace_i_d");
  CREATE INDEX "realize_ai_execution_jobs_bound_plan_hash_idx" ON "realize_ai_execution_jobs" USING btree ("bound_plan_hash");
  CREATE INDEX "realize_ai_execution_jobs_bound_scope_hash_idx" ON "realize_ai_execution_jobs" USING btree ("bound_scope_hash");
  CREATE INDEX "realize_ai_execution_jobs_capability_expires_at_idx" ON "realize_ai_execution_jobs" USING btree ("capability_expires_at");
  CREATE INDEX "realize_ai_execution_jobs_capability_token_hash_idx" ON "realize_ai_execution_jobs" USING btree ("capability_token_hash");
  CREATE INDEX "realize_ai_execution_jobs_diff_hash_idx" ON "realize_ai_execution_jobs" USING btree ("diff_hash");
  CREATE INDEX "realize_ai_execution_jobs_evidence_hash_idx" ON "realize_ai_execution_jobs" USING btree ("evidence_hash");
  CREATE INDEX "realize_ai_execution_jobs_artifacts_expire_at_idx" ON "realize_ai_execution_jobs" USING btree ("artifacts_expire_at");
  CREATE INDEX "realize_ai_execution_jobs_updated_at_idx" ON "realize_ai_execution_jobs" USING btree ("updated_at");
  CREATE INDEX "realize_ai_execution_jobs_created_at_idx" ON "realize_ai_execution_jobs" USING btree ("created_at");
  CREATE INDEX "realize_ai_check_results_execution_job_idx" ON "realize_ai_check_results" USING btree ("execution_job_id");
  CREATE INDEX "realize_ai_check_results_status_idx" ON "realize_ai_check_results" USING btree ("status");
  CREATE INDEX "realize_ai_check_results_evidence_hash_idx" ON "realize_ai_check_results" USING btree ("evidence_hash");
  CREATE UNIQUE INDEX "realize_ai_check_results_result_key_idx" ON "realize_ai_check_results" USING btree ("result_key");
  CREATE INDEX "realize_ai_check_results_updated_at_idx" ON "realize_ai_check_results" USING btree ("updated_at");
  CREATE INDEX "realize_ai_check_results_created_at_idx" ON "realize_ai_check_results" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_realize_ai_execution_jobs_fk" FOREIGN KEY ("realize_ai_execution_jobs_id") REFERENCES "public"."realize_ai_execution_jobs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_realize_ai_check_results_fk" FOREIGN KEY ("realize_ai_check_results_id") REFERENCES "public"."realize_ai_check_results"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "realize_ai_approvals_diff_hash_idx" ON "realize_ai_approvals" USING btree ("diff_hash");
  CREATE INDEX "payload_locked_documents_rels_realize_ai_execution_jobs__idx" ON "payload_locked_documents_rels" USING btree ("realize_ai_execution_jobs_id");
  CREATE INDEX "payload_locked_documents_rels_realize_ai_check_results_i_idx" ON "payload_locked_documents_rels" USING btree ("realize_ai_check_results_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_realize_ai_execution_jobs_fk";

  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_realize_ai_check_results_fk";

  DROP INDEX "payload_locked_documents_rels_realize_ai_execution_jobs__idx";
  DROP INDEX "payload_locked_documents_rels_realize_ai_check_results_i_idx";
   ALTER TABLE "realize_ai_execution_jobs" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "realize_ai_check_results" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "realize_ai_execution_jobs" CASCADE;
  DROP TABLE "realize_ai_check_results" CASCADE;
  UPDATE "realize_ai_change_requests"
     SET "state" = 'blocked'
   WHERE "state" NOT IN ('awaiting_plan_approval', 'plan_approved', 'blocked');
  ALTER TABLE "realize_ai_change_requests" ALTER COLUMN "state" SET DATA TYPE text;
  DROP TYPE "public"."enum_realize_ai_change_requests_state";
  CREATE TYPE "public"."enum_realize_ai_change_requests_state" AS ENUM('awaiting_plan_approval', 'plan_approved', 'blocked');
  ALTER TABLE "realize_ai_change_requests" ALTER COLUMN "state" SET DATA TYPE "public"."enum_realize_ai_change_requests_state" USING "state"::"public"."enum_realize_ai_change_requests_state";
  DROP INDEX "realize_ai_approvals_diff_hash_idx";
  ALTER TABLE "realize_ai_approvals" ALTER COLUMN "type" SET DATA TYPE varchar;
  ALTER TABLE "realize_ai_approvals" ALTER COLUMN "type" SET DEFAULT 'PLAN_APPROVAL';
  ALTER TABLE "realize_ai_approvals" DROP COLUMN "diff_hash";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "realize_ai_execution_jobs_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "realize_ai_check_results_id";
  DROP TYPE "public"."enum_realize_ai_approvals_type";
  DROP TYPE "public"."enum_realize_ai_execution_jobs_status";
  DROP TYPE "public"."enum_realize_ai_execution_jobs_stage";
  DROP TYPE "public"."enum_realize_ai_check_results_status";`)
}
