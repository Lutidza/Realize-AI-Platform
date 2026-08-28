import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_realize_ai_source_promotions_provider" AS ENUM('github');
  CREATE TYPE "public"."enum_realize_ai_source_promotions_status" AS ENUM('queued', 'validating', 'publishing_ref', 'creating_pull_request', 'ready', 'failed', 'blocked');
  CREATE TYPE "public"."enum_realize_ai_source_promotions_stage" AS ENUM('queued', 'source_validation', 'ref_publication', 'pull_request', 'complete');
  CREATE TYPE "public"."enum_realize_ai_source_promotions_pull_request_state" AS ENUM('open', 'closed');
  CREATE TABLE "realize_ai_source_promotions" (
	"id" serial PRIMARY KEY NOT NULL,
	"change_request_id" integer NOT NULL,
	"preview_deployment_id" integer NOT NULL,
	"initiated_by_id" integer NOT NULL,
	"provider" "enum_realize_ai_source_promotions_provider" DEFAULT 'github' NOT NULL,
	"status" "enum_realize_ai_source_promotions_status" NOT NULL,
	"stage" "enum_realize_ai_source_promotions_stage" NOT NULL,
	"attempt" numeric DEFAULT 0 NOT NULL,
	"promotion_key" varchar NOT NULL,
	"idempotency_key" varchar NOT NULL,
	"repository_slug" varchar NOT NULL,
	"integration_revision" numeric NOT NULL,
	"base_branch" varchar NOT NULL,
	"head_branch" varchar NOT NULL,
	"git_commit" varchar NOT NULL,
	"source_preview_artifact_hash" varchar NOT NULL,
	"source_preview_evidence_hash" varchar NOT NULL,
	"source_acceptance_hash" varchar NOT NULL,
	"worker_i_d" varchar,
	"pull_request_number" numeric,
	"pull_request_u_r_l" varchar,
	"pull_request_state" "enum_realize_ai_source_promotions_pull_request_state",
	"draft" boolean,
	"evidence_hash" varchar,
	"error_summary" varchar,
	"started_at" timestamp(3) with time zone,
	"completed_at" timestamp(3) with time zone,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "realize_ai_source_promotions_id" integer;
  ALTER TABLE "realize_ai_source_promotions" ADD CONSTRAINT "realize_ai_source_promotions_change_request_id_realize_ai_change_requests_id_fk" FOREIGN KEY ("change_request_id") REFERENCES "public"."realize_ai_change_requests"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "realize_ai_source_promotions" ADD CONSTRAINT "realize_ai_source_promotions_preview_deployment_id_realize_ai_deployments_id_fk" FOREIGN KEY ("preview_deployment_id") REFERENCES "public"."realize_ai_deployments"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "realize_ai_source_promotions" ADD CONSTRAINT "realize_ai_source_promotions_initiated_by_id_users_id_fk" FOREIGN KEY ("initiated_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "realize_ai_source_promotions_change_request_idx" ON "realize_ai_source_promotions" USING btree ("change_request_id");
  CREATE INDEX "realize_ai_source_promotions_preview_deployment_idx" ON "realize_ai_source_promotions" USING btree ("preview_deployment_id");
  CREATE INDEX "realize_ai_source_promotions_initiated_by_idx" ON "realize_ai_source_promotions" USING btree ("initiated_by_id");
  CREATE INDEX "realize_ai_source_promotions_provider_idx" ON "realize_ai_source_promotions" USING btree ("provider");
  CREATE INDEX "realize_ai_source_promotions_status_idx" ON "realize_ai_source_promotions" USING btree ("status");
  CREATE UNIQUE INDEX "realize_ai_source_promotions_promotion_key_idx" ON "realize_ai_source_promotions" USING btree ("promotion_key");
  CREATE UNIQUE INDEX "realize_ai_source_promotions_idempotency_key_idx" ON "realize_ai_source_promotions" USING btree ("idempotency_key");
  CREATE INDEX "realize_ai_source_promotions_repository_slug_idx" ON "realize_ai_source_promotions" USING btree ("repository_slug");
  CREATE INDEX "realize_ai_source_promotions_base_branch_idx" ON "realize_ai_source_promotions" USING btree ("base_branch");
  CREATE UNIQUE INDEX "realize_ai_source_promotions_head_branch_idx" ON "realize_ai_source_promotions" USING btree ("head_branch");
  CREATE INDEX "realize_ai_source_promotions_git_commit_idx" ON "realize_ai_source_promotions" USING btree ("git_commit");
  CREATE INDEX "realize_ai_source_promotions_source_preview_artifact_has_idx" ON "realize_ai_source_promotions" USING btree ("source_preview_artifact_hash");
  CREATE INDEX "realize_ai_source_promotions_source_preview_evidence_has_idx" ON "realize_ai_source_promotions" USING btree ("source_preview_evidence_hash");
  CREATE INDEX "realize_ai_source_promotions_source_acceptance_hash_idx" ON "realize_ai_source_promotions" USING btree ("source_acceptance_hash");
  CREATE INDEX "realize_ai_source_promotions_evidence_hash_idx" ON "realize_ai_source_promotions" USING btree ("evidence_hash");
  CREATE INDEX "realize_ai_source_promotions_updated_at_idx" ON "realize_ai_source_promotions" USING btree ("updated_at");
  CREATE INDEX "realize_ai_source_promotions_created_at_idx" ON "realize_ai_source_promotions" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_realize_ai_source_promotion_fk" FOREIGN KEY ("realize_ai_source_promotions_id") REFERENCES "public"."realize_ai_source_promotions"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_realize_ai_source_promotio_idx" ON "payload_locked_documents_rels" USING btree ("realize_ai_source_promotions_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_realize_ai_source_promotion_fk";
  DROP INDEX "payload_locked_documents_rels_realize_ai_source_promotio_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "realize_ai_source_promotions_id";
  ALTER TABLE "realize_ai_source_promotions" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "realize_ai_source_promotions" CASCADE;
  DROP TYPE "public"."enum_realize_ai_source_promotions_provider";
  DROP TYPE "public"."enum_realize_ai_source_promotions_status";
  DROP TYPE "public"."enum_realize_ai_source_promotions_stage";
  DROP TYPE "public"."enum_realize_ai_source_promotions_pull_request_state";`)
}
