import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_realize_ai_conversations_status" AS ENUM('active', 'archived');
  CREATE TYPE "public"."enum_realize_ai_messages_role" AS ENUM('user', 'assistant', 'system');
  CREATE TYPE "public"."enum_realize_ai_messages_kind" AS ENUM('user_message', 'assistant_message', 'usage_notice', 'system_error');
  CREATE TYPE "public"."enum_realize_ai_runs_status" AS ENUM('queued', 'running', 'completed', 'failed', 'cancelled');
  CREATE TYPE "public"."enum_realize_ai_run_events_visibility" AS ENUM('user-visible', 'internal-summary', 'redacted');
  CREATE TABLE "realize_ai_conversations" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"status" "enum_realize_ai_conversations_status" DEFAULT 'active' NOT NULL,
  	"created_by_id" integer NOT NULL,
  	"last_message_at" timestamp(3) with time zone NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "realize_ai_messages" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"conversation_id" integer NOT NULL,
  	"role" "enum_realize_ai_messages_role" NOT NULL,
  	"kind" "enum_realize_ai_messages_kind" NOT NULL,
  	"content" varchar NOT NULL,
  	"run_i_d" varchar,
  	"sequence" numeric NOT NULL,
  	"usage_summary" jsonb,
  	"idempotency_key" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "realize_ai_runs" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"conversation_id" integer NOT NULL,
  	"provider" varchar DEFAULT 'openai-codex' NOT NULL,
  	"model" varchar,
  	"thread_i_d" varchar,
  	"status" "enum_realize_ai_runs_status" DEFAULT 'queued' NOT NULL,
  	"sandbox_profile" varchar DEFAULT 'analysis-readonly' NOT NULL,
  	"started_at" timestamp(3) with time zone,
  	"finished_at" timestamp(3) with time zone,
  	"usage" jsonb,
  	"error_summary" varchar,
  	"event_cursor" numeric DEFAULT 0 NOT NULL,
  	"idempotency_key" varchar NOT NULL,
  	"requested_by_id" integer NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "realize_ai_run_events" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"run_id" integer NOT NULL,
  	"sequence" numeric NOT NULL,
  	"event_i_d" varchar NOT NULL,
  	"type" varchar NOT NULL,
  	"visibility" "enum_realize_ai_run_events_visibility" NOT NULL,
  	"payload" jsonb NOT NULL,
  	"occurred_at" timestamp(3) with time zone NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "realize_ai_conversations_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "realize_ai_messages_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "realize_ai_runs_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "realize_ai_run_events_id" integer;
  ALTER TABLE "realize_ai_conversations" ADD CONSTRAINT "realize_ai_conversations_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "realize_ai_messages" ADD CONSTRAINT "realize_ai_messages_conversation_id_realize_ai_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."realize_ai_conversations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "realize_ai_runs" ADD CONSTRAINT "realize_ai_runs_conversation_id_realize_ai_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."realize_ai_conversations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "realize_ai_runs" ADD CONSTRAINT "realize_ai_runs_requested_by_id_users_id_fk" FOREIGN KEY ("requested_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "realize_ai_run_events" ADD CONSTRAINT "realize_ai_run_events_run_id_realize_ai_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."realize_ai_runs"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "realize_ai_conversations_title_idx" ON "realize_ai_conversations" USING btree ("title");
  CREATE INDEX "realize_ai_conversations_status_idx" ON "realize_ai_conversations" USING btree ("status");
  CREATE INDEX "realize_ai_conversations_created_by_idx" ON "realize_ai_conversations" USING btree ("created_by_id");
  CREATE INDEX "realize_ai_conversations_last_message_at_idx" ON "realize_ai_conversations" USING btree ("last_message_at");
  CREATE INDEX "realize_ai_conversations_updated_at_idx" ON "realize_ai_conversations" USING btree ("updated_at");
  CREATE INDEX "realize_ai_conversations_created_at_idx" ON "realize_ai_conversations" USING btree ("created_at");
  CREATE INDEX "realize_ai_messages_conversation_idx" ON "realize_ai_messages" USING btree ("conversation_id");
  CREATE INDEX "realize_ai_messages_run_i_d_idx" ON "realize_ai_messages" USING btree ("run_i_d");
  CREATE INDEX "realize_ai_messages_sequence_idx" ON "realize_ai_messages" USING btree ("sequence");
  CREATE UNIQUE INDEX "realize_ai_messages_idempotency_key_idx" ON "realize_ai_messages" USING btree ("idempotency_key");
  CREATE INDEX "realize_ai_messages_updated_at_idx" ON "realize_ai_messages" USING btree ("updated_at");
  CREATE INDEX "realize_ai_messages_created_at_idx" ON "realize_ai_messages" USING btree ("created_at");
  CREATE INDEX "realize_ai_runs_conversation_idx" ON "realize_ai_runs" USING btree ("conversation_id");
  CREATE INDEX "realize_ai_runs_thread_i_d_idx" ON "realize_ai_runs" USING btree ("thread_i_d");
  CREATE INDEX "realize_ai_runs_status_idx" ON "realize_ai_runs" USING btree ("status");
  CREATE UNIQUE INDEX "realize_ai_runs_idempotency_key_idx" ON "realize_ai_runs" USING btree ("idempotency_key");
  CREATE INDEX "realize_ai_runs_requested_by_idx" ON "realize_ai_runs" USING btree ("requested_by_id");
  CREATE INDEX "realize_ai_runs_updated_at_idx" ON "realize_ai_runs" USING btree ("updated_at");
  CREATE INDEX "realize_ai_runs_created_at_idx" ON "realize_ai_runs" USING btree ("created_at");
  CREATE INDEX "realize_ai_run_events_run_idx" ON "realize_ai_run_events" USING btree ("run_id");
  CREATE INDEX "realize_ai_run_events_sequence_idx" ON "realize_ai_run_events" USING btree ("sequence");
  CREATE UNIQUE INDEX "realize_ai_run_events_event_i_d_idx" ON "realize_ai_run_events" USING btree ("event_i_d");
  CREATE INDEX "realize_ai_run_events_type_idx" ON "realize_ai_run_events" USING btree ("type");
  CREATE INDEX "realize_ai_run_events_updated_at_idx" ON "realize_ai_run_events" USING btree ("updated_at");
  CREATE INDEX "realize_ai_run_events_created_at_idx" ON "realize_ai_run_events" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_realize_ai_conversations_fk" FOREIGN KEY ("realize_ai_conversations_id") REFERENCES "public"."realize_ai_conversations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_realize_ai_messages_fk" FOREIGN KEY ("realize_ai_messages_id") REFERENCES "public"."realize_ai_messages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_realize_ai_runs_fk" FOREIGN KEY ("realize_ai_runs_id") REFERENCES "public"."realize_ai_runs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_realize_ai_run_events_fk" FOREIGN KEY ("realize_ai_run_events_id") REFERENCES "public"."realize_ai_run_events"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_realize_ai_conversations_i_idx" ON "payload_locked_documents_rels" USING btree ("realize_ai_conversations_id");
  CREATE INDEX "payload_locked_documents_rels_realize_ai_messages_id_idx" ON "payload_locked_documents_rels" USING btree ("realize_ai_messages_id");
  CREATE INDEX "payload_locked_documents_rels_realize_ai_runs_id_idx" ON "payload_locked_documents_rels" USING btree ("realize_ai_runs_id");
  CREATE INDEX "payload_locked_documents_rels_realize_ai_run_events_id_idx" ON "payload_locked_documents_rels" USING btree ("realize_ai_run_events_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "realize_ai_conversations" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "realize_ai_messages" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "realize_ai_runs" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "realize_ai_run_events" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "realize_ai_conversations" CASCADE;
  DROP TABLE "realize_ai_messages" CASCADE;
  DROP TABLE "realize_ai_runs" CASCADE;
  DROP TABLE "realize_ai_run_events" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_realize_ai_conversations_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_realize_ai_messages_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_realize_ai_runs_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_realize_ai_run_events_fk";
  
  DROP INDEX "payload_locked_documents_rels_realize_ai_conversations_i_idx";
  DROP INDEX "payload_locked_documents_rels_realize_ai_messages_id_idx";
  DROP INDEX "payload_locked_documents_rels_realize_ai_runs_id_idx";
  DROP INDEX "payload_locked_documents_rels_realize_ai_run_events_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "realize_ai_conversations_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "realize_ai_messages_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "realize_ai_runs_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "realize_ai_run_events_id";
  DROP TYPE "public"."enum_realize_ai_conversations_status";
  DROP TYPE "public"."enum_realize_ai_messages_role";
  DROP TYPE "public"."enum_realize_ai_messages_kind";
  DROP TYPE "public"."enum_realize_ai_runs_status";
  DROP TYPE "public"."enum_realize_ai_run_events_visibility";`)
}
