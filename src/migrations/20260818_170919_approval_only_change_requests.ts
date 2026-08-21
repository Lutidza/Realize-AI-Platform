import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_realize_ai_change_requests_type" AS ENUM('QUERY', 'CONTENT_CHANGE', 'CATALOG_CHANGE', 'CONFIG_CHANGE', 'THEME_CHANGE', 'CODE_CHANGE', 'SCHEMA_CHANGE', 'MIXED_CHANGE', 'DEPLOYMENT_ONLY', 'ROLLBACK', 'AGENCY_ENGINEERING_REQUEST');
  CREATE TYPE "public"."enum_realize_ai_change_requests_state" AS ENUM('awaiting_plan_approval', 'plan_approved', 'blocked');
  CREATE TYPE "public"."enum_realize_ai_change_requests_risk_level" AS ENUM('R0', 'R1', 'R2', 'R3', 'R4');
  CREATE TYPE "public"."enum_realize_ai_approvals_decision" AS ENUM('approved', 'rejected');
  CREATE TABLE "realize_ai_change_requests" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"type" "enum_realize_ai_change_requests_type" NOT NULL,
  	"state" "enum_realize_ai_change_requests_state" NOT NULL,
  	"version" numeric DEFAULT 1 NOT NULL,
  	"risk_level" "enum_realize_ai_change_requests_risk_level" NOT NULL,
  	"requested_by_id" integer NOT NULL,
  	"conversation_id" integer NOT NULL,
  	"source_message_id" integer NOT NULL,
  	"original_request" varchar NOT NULL,
  	"normalized_intent" varchar NOT NULL,
  	"plan" varchar NOT NULL,
  	"plan_hash" varchar NOT NULL,
  	"affected_paths" jsonb NOT NULL,
  	"checks" jsonb NOT NULL,
  	"scope_hash" varchar NOT NULL,
  	"blocked_reason" varchar,
  	"expires_at" timestamp(3) with time zone NOT NULL,
  	"source_message_key" varchar NOT NULL,
  	"idempotency_key" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "realize_ai_approvals" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"change_request_id" integer NOT NULL,
  	"type" varchar DEFAULT 'PLAN_APPROVAL' NOT NULL,
  	"decision" "enum_realize_ai_approvals_decision" NOT NULL,
  	"actor_id" integer NOT NULL,
  	"role_snapshot" jsonb NOT NULL,
  	"bound_hash" varchar NOT NULL,
  	"comment" varchar,
  	"expires_at" timestamp(3) with time zone NOT NULL,
  	"decision_key" varchar NOT NULL,
  	"idempotency_key" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "realize_ai_change_requests_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "realize_ai_approvals_id" integer;
  ALTER TABLE "realize_ai_change_requests" ADD CONSTRAINT "realize_ai_change_requests_requested_by_id_users_id_fk" FOREIGN KEY ("requested_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "realize_ai_change_requests" ADD CONSTRAINT "realize_ai_change_requests_conversation_id_realize_ai_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."realize_ai_conversations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "realize_ai_change_requests" ADD CONSTRAINT "realize_ai_change_requests_source_message_id_realize_ai_messages_id_fk" FOREIGN KEY ("source_message_id") REFERENCES "public"."realize_ai_messages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "realize_ai_approvals" ADD CONSTRAINT "realize_ai_approvals_change_request_id_realize_ai_change_requests_id_fk" FOREIGN KEY ("change_request_id") REFERENCES "public"."realize_ai_change_requests"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "realize_ai_approvals" ADD CONSTRAINT "realize_ai_approvals_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "realize_ai_change_requests_type_idx" ON "realize_ai_change_requests" USING btree ("type");
  CREATE INDEX "realize_ai_change_requests_state_idx" ON "realize_ai_change_requests" USING btree ("state");
  CREATE INDEX "realize_ai_change_requests_risk_level_idx" ON "realize_ai_change_requests" USING btree ("risk_level");
  CREATE INDEX "realize_ai_change_requests_requested_by_idx" ON "realize_ai_change_requests" USING btree ("requested_by_id");
  CREATE INDEX "realize_ai_change_requests_conversation_idx" ON "realize_ai_change_requests" USING btree ("conversation_id");
  CREATE INDEX "realize_ai_change_requests_source_message_idx" ON "realize_ai_change_requests" USING btree ("source_message_id");
  CREATE INDEX "realize_ai_change_requests_plan_hash_idx" ON "realize_ai_change_requests" USING btree ("plan_hash");
  CREATE INDEX "realize_ai_change_requests_scope_hash_idx" ON "realize_ai_change_requests" USING btree ("scope_hash");
  CREATE INDEX "realize_ai_change_requests_expires_at_idx" ON "realize_ai_change_requests" USING btree ("expires_at");
  CREATE UNIQUE INDEX "realize_ai_change_requests_source_message_key_idx" ON "realize_ai_change_requests" USING btree ("source_message_key");
  CREATE UNIQUE INDEX "realize_ai_change_requests_idempotency_key_idx" ON "realize_ai_change_requests" USING btree ("idempotency_key");
  CREATE INDEX "realize_ai_change_requests_updated_at_idx" ON "realize_ai_change_requests" USING btree ("updated_at");
  CREATE INDEX "realize_ai_change_requests_created_at_idx" ON "realize_ai_change_requests" USING btree ("created_at");
  CREATE INDEX "realize_ai_approvals_change_request_idx" ON "realize_ai_approvals" USING btree ("change_request_id");
  CREATE INDEX "realize_ai_approvals_decision_idx" ON "realize_ai_approvals" USING btree ("decision");
  CREATE INDEX "realize_ai_approvals_actor_idx" ON "realize_ai_approvals" USING btree ("actor_id");
  CREATE INDEX "realize_ai_approvals_bound_hash_idx" ON "realize_ai_approvals" USING btree ("bound_hash");
  CREATE UNIQUE INDEX "realize_ai_approvals_decision_key_idx" ON "realize_ai_approvals" USING btree ("decision_key");
  CREATE UNIQUE INDEX "realize_ai_approvals_idempotency_key_idx" ON "realize_ai_approvals" USING btree ("idempotency_key");
  CREATE INDEX "realize_ai_approvals_updated_at_idx" ON "realize_ai_approvals" USING btree ("updated_at");
  CREATE INDEX "realize_ai_approvals_created_at_idx" ON "realize_ai_approvals" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_realize_ai_change_requests_fk" FOREIGN KEY ("realize_ai_change_requests_id") REFERENCES "public"."realize_ai_change_requests"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_realize_ai_approvals_fk" FOREIGN KEY ("realize_ai_approvals_id") REFERENCES "public"."realize_ai_approvals"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_realize_ai_change_requests_idx" ON "payload_locked_documents_rels" USING btree ("realize_ai_change_requests_id");
  CREATE INDEX "payload_locked_documents_rels_realize_ai_approvals_id_idx" ON "payload_locked_documents_rels" USING btree ("realize_ai_approvals_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_realize_ai_change_requests_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_realize_ai_approvals_fk";
  
  DROP INDEX "payload_locked_documents_rels_realize_ai_change_requests_idx";
  DROP INDEX "payload_locked_documents_rels_realize_ai_approvals_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "realize_ai_change_requests_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "realize_ai_approvals_id";
  ALTER TABLE "realize_ai_change_requests" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "realize_ai_approvals" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "realize_ai_approvals" CASCADE;
  DROP TABLE "realize_ai_change_requests" CASCADE;
  DROP TYPE "public"."enum_realize_ai_change_requests_type";
  DROP TYPE "public"."enum_realize_ai_change_requests_state";
  DROP TYPE "public"."enum_realize_ai_change_requests_risk_level";
  DROP TYPE "public"."enum_realize_ai_approvals_decision";`)
}
