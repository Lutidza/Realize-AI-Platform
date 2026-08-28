import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_realize_ai_data_operations_kind" AS ENUM('catalog.assignCategory.v1');
  CREATE TYPE "public"."enum_realize_ai_data_operations_state" AS ENUM('awaiting_approval', 'approved', 'rejected', 'applied', 'apply_failed', 'rollback_approved', 'rolled_back', 'rollback_failed');
  CREATE TYPE "public"."enum_realize_ai_data_operations_risk_level" AS ENUM('R1');
  CREATE TYPE "public"."enum_realize_ai_data_operations_approval_policy" AS ENUM('WRITE_CONFIRMATION');
  CREATE TYPE "public"."enum_realize_ai_data_operations_rollback_strategy" AS ENUM('before-snapshot');
  CREATE TYPE "public"."enum_realize_ai_data_operation_approvals_type" AS ENUM('WRITE_CONFIRMATION', 'ROLLBACK_APPROVAL');
  CREATE TYPE "public"."enum_realize_ai_data_operation_approvals_decision" AS ENUM('approved', 'rejected');
  CREATE TYPE "public"."enum_realize_ai_data_operation_events_type" AS ENUM('preview_created', 'write_approved', 'write_rejected', 'apply_succeeded', 'apply_failed', 'rollback_approved', 'rollback_succeeded', 'rollback_failed');
  CREATE TYPE "public"."enum_realize_ai_data_operation_events_delivery_status" AS ENUM('pending', 'delivered');
  CREATE TABLE "realize_ai_data_operations" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar NOT NULL,
	"kind" "enum_realize_ai_data_operations_kind" NOT NULL,
	"state" "enum_realize_ai_data_operations_state" NOT NULL,
	"version" numeric DEFAULT 1 NOT NULL,
	"risk_level" "enum_realize_ai_data_operations_risk_level" DEFAULT 'R1' NOT NULL,
	"approval_policy" "enum_realize_ai_data_operations_approval_policy" DEFAULT 'WRITE_CONFIRMATION' NOT NULL,
	"rollback_strategy" "enum_realize_ai_data_operations_rollback_strategy" DEFAULT 'before-snapshot' NOT NULL,
	"estimated_count" numeric DEFAULT 1 NOT NULL,
	"requested_by_id" integer NOT NULL,
	"conversation_id" integer NOT NULL,
	"source_message_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"category_id" integer NOT NULL,
	"original_request" varchar NOT NULL,
	"intent" jsonb NOT NULL,
	"product_snapshot" jsonb NOT NULL,
	"category_snapshot" jsonb NOT NULL,
	"before_snapshot" jsonb NOT NULL,
	"after_snapshot" jsonb NOT NULL,
	"expected_target_updated_at" varchar NOT NULL,
	"applied_target_updated_at" varchar,
	"operation_hash" varchar NOT NULL,
	"rollback_hash" varchar NOT NULL,
	"error_summary" varchar,
	"expires_at" timestamp(3) with time zone NOT NULL,
	"applied_at" timestamp(3) with time zone,
	"rolled_back_at" timestamp(3) with time zone,
	"source_message_key" varchar NOT NULL,
	"idempotency_key" varchar NOT NULL,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "realize_ai_data_operation_approvals" (
	"id" serial PRIMARY KEY NOT NULL,
	"data_operation_id" integer NOT NULL,
	"type" "enum_realize_ai_data_operation_approvals_type" NOT NULL,
	"decision" "enum_realize_ai_data_operation_approvals_decision" NOT NULL,
	"actor_id" integer NOT NULL,
	"role_snapshot" jsonb NOT NULL,
	"target_hash" varchar NOT NULL,
	"bound_hash" varchar NOT NULL,
	"operation_version" numeric NOT NULL,
	"comment" varchar,
	"expires_at" timestamp(3) with time zone NOT NULL,
	"decision_key" varchar NOT NULL,
	"idempotency_key" varchar NOT NULL,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "realize_ai_data_operation_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"data_operation_id" integer NOT NULL,
	"type" "enum_realize_ai_data_operation_events_type" NOT NULL,
	"from_state" varchar,
	"to_state" varchar NOT NULL,
	"actor_id" integer,
	"payload" jsonb NOT NULL,
	"topic" varchar NOT NULL,
	"delivery_status" "enum_realize_ai_data_operation_events_delivery_status" DEFAULT 'pending' NOT NULL,
	"occurred_at" timestamp(3) with time zone NOT NULL,
	"idempotency_key" varchar NOT NULL,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "realize_ai_data_operations_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "realize_ai_data_operation_approvals_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "realize_ai_data_operation_events_id" integer;
  ALTER TABLE "realize_ai_data_operations" ADD CONSTRAINT "realize_ai_data_operations_requested_by_id_users_id_fk" FOREIGN KEY ("requested_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "realize_ai_data_operations" ADD CONSTRAINT "realize_ai_data_operations_conversation_id_realize_ai_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."realize_ai_conversations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "realize_ai_data_operations" ADD CONSTRAINT "realize_ai_data_operations_source_message_id_realize_ai_messages_id_fk" FOREIGN KEY ("source_message_id") REFERENCES "public"."realize_ai_messages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "realize_ai_data_operations" ADD CONSTRAINT "realize_ai_data_operations_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "realize_ai_data_operations" ADD CONSTRAINT "realize_ai_data_operations_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "realize_ai_data_operation_approvals" ADD CONSTRAINT "realize_ai_data_operation_approvals_data_operation_id_realize_ai_data_operations_id_fk" FOREIGN KEY ("data_operation_id") REFERENCES "public"."realize_ai_data_operations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "realize_ai_data_operation_approvals" ADD CONSTRAINT "realize_ai_data_operation_approvals_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "realize_ai_data_operation_events" ADD CONSTRAINT "realize_ai_data_operation_events_data_operation_id_realize_ai_data_operations_id_fk" FOREIGN KEY ("data_operation_id") REFERENCES "public"."realize_ai_data_operations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "realize_ai_data_operation_events" ADD CONSTRAINT "realize_ai_data_operation_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "realize_ai_data_operations_kind_idx" ON "realize_ai_data_operations" USING btree ("kind");
  CREATE INDEX "realize_ai_data_operations_state_idx" ON "realize_ai_data_operations" USING btree ("state");
  CREATE INDEX "realize_ai_data_operations_requested_by_idx" ON "realize_ai_data_operations" USING btree ("requested_by_id");
  CREATE INDEX "realize_ai_data_operations_conversation_idx" ON "realize_ai_data_operations" USING btree ("conversation_id");
  CREATE INDEX "realize_ai_data_operations_source_message_idx" ON "realize_ai_data_operations" USING btree ("source_message_id");
  CREATE INDEX "realize_ai_data_operations_product_idx" ON "realize_ai_data_operations" USING btree ("product_id");
  CREATE INDEX "realize_ai_data_operations_category_idx" ON "realize_ai_data_operations" USING btree ("category_id");
  CREATE INDEX "realize_ai_data_operations_expected_target_updated_at_idx" ON "realize_ai_data_operations" USING btree ("expected_target_updated_at");
  CREATE INDEX "realize_ai_data_operations_operation_hash_idx" ON "realize_ai_data_operations" USING btree ("operation_hash");
  CREATE INDEX "realize_ai_data_operations_rollback_hash_idx" ON "realize_ai_data_operations" USING btree ("rollback_hash");
  CREATE INDEX "realize_ai_data_operations_expires_at_idx" ON "realize_ai_data_operations" USING btree ("expires_at");
  CREATE UNIQUE INDEX "realize_ai_data_operations_source_message_key_idx" ON "realize_ai_data_operations" USING btree ("source_message_key");
  CREATE UNIQUE INDEX "realize_ai_data_operations_idempotency_key_idx" ON "realize_ai_data_operations" USING btree ("idempotency_key");
  CREATE INDEX "realize_ai_data_operations_updated_at_idx" ON "realize_ai_data_operations" USING btree ("updated_at");
  CREATE INDEX "realize_ai_data_operations_created_at_idx" ON "realize_ai_data_operations" USING btree ("created_at");
  CREATE INDEX "realize_ai_data_operation_approvals_data_operation_idx" ON "realize_ai_data_operation_approvals" USING btree ("data_operation_id");
  CREATE INDEX "realize_ai_data_operation_approvals_type_idx" ON "realize_ai_data_operation_approvals" USING btree ("type");
  CREATE INDEX "realize_ai_data_operation_approvals_decision_idx" ON "realize_ai_data_operation_approvals" USING btree ("decision");
  CREATE INDEX "realize_ai_data_operation_approvals_actor_idx" ON "realize_ai_data_operation_approvals" USING btree ("actor_id");
  CREATE INDEX "realize_ai_data_operation_approvals_target_hash_idx" ON "realize_ai_data_operation_approvals" USING btree ("target_hash");
  CREATE INDEX "realize_ai_data_operation_approvals_bound_hash_idx" ON "realize_ai_data_operation_approvals" USING btree ("bound_hash");
  CREATE UNIQUE INDEX "realize_ai_data_operation_approvals_decision_key_idx" ON "realize_ai_data_operation_approvals" USING btree ("decision_key");
  CREATE UNIQUE INDEX "realize_ai_data_operation_approvals_idempotency_key_idx" ON "realize_ai_data_operation_approvals" USING btree ("idempotency_key");
  CREATE INDEX "realize_ai_data_operation_approvals_updated_at_idx" ON "realize_ai_data_operation_approvals" USING btree ("updated_at");
  CREATE INDEX "realize_ai_data_operation_approvals_created_at_idx" ON "realize_ai_data_operation_approvals" USING btree ("created_at");
  CREATE INDEX "realize_ai_data_operation_events_data_operation_idx" ON "realize_ai_data_operation_events" USING btree ("data_operation_id");
  CREATE INDEX "realize_ai_data_operation_events_type_idx" ON "realize_ai_data_operation_events" USING btree ("type");
  CREATE INDEX "realize_ai_data_operation_events_actor_idx" ON "realize_ai_data_operation_events" USING btree ("actor_id");
  CREATE INDEX "realize_ai_data_operation_events_topic_idx" ON "realize_ai_data_operation_events" USING btree ("topic");
  CREATE INDEX "realize_ai_data_operation_events_delivery_status_idx" ON "realize_ai_data_operation_events" USING btree ("delivery_status");
  CREATE INDEX "realize_ai_data_operation_events_occurred_at_idx" ON "realize_ai_data_operation_events" USING btree ("occurred_at");
  CREATE UNIQUE INDEX "realize_ai_data_operation_events_idempotency_key_idx" ON "realize_ai_data_operation_events" USING btree ("idempotency_key");
  CREATE INDEX "realize_ai_data_operation_events_updated_at_idx" ON "realize_ai_data_operation_events" USING btree ("updated_at");
  CREATE INDEX "realize_ai_data_operation_events_created_at_idx" ON "realize_ai_data_operation_events" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_realize_ai_data_operations_fk" FOREIGN KEY ("realize_ai_data_operations_id") REFERENCES "public"."realize_ai_data_operations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_realize_ai_data_operation_a_fk" FOREIGN KEY ("realize_ai_data_operation_approvals_id") REFERENCES "public"."realize_ai_data_operation_approvals"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_realize_ai_data_operation_e_fk" FOREIGN KEY ("realize_ai_data_operation_events_id") REFERENCES "public"."realize_ai_data_operation_events"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_realize_ai_data_operations_idx" ON "payload_locked_documents_rels" USING btree ("realize_ai_data_operations_id");
  CREATE INDEX "payload_locked_documents_rels_realize_ai_data_operation__idx" ON "payload_locked_documents_rels" USING btree ("realize_ai_data_operation_approvals_id");
  CREATE INDEX "payload_locked_documents_rels_realize_ai_data_operatio_1_idx" ON "payload_locked_documents_rels" USING btree ("realize_ai_data_operation_events_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_realize_ai_data_operations_fk";

  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_realize_ai_data_operation_a_fk";

  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_realize_ai_data_operation_e_fk";

  DROP INDEX "payload_locked_documents_rels_realize_ai_data_operations_idx";
  DROP INDEX "payload_locked_documents_rels_realize_ai_data_operation__idx";
  DROP INDEX "payload_locked_documents_rels_realize_ai_data_operatio_1_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "realize_ai_data_operations_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "realize_ai_data_operation_approvals_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "realize_ai_data_operation_events_id";
  ALTER TABLE "realize_ai_data_operation_events" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "realize_ai_data_operation_approvals" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "realize_ai_data_operations" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "realize_ai_data_operation_events" CASCADE;
  DROP TABLE "realize_ai_data_operation_approvals" CASCADE;
  DROP TABLE "realize_ai_data_operations" CASCADE;
  DROP TYPE "public"."enum_realize_ai_data_operations_kind";
  DROP TYPE "public"."enum_realize_ai_data_operations_state";
  DROP TYPE "public"."enum_realize_ai_data_operations_risk_level";
  DROP TYPE "public"."enum_realize_ai_data_operations_approval_policy";
  DROP TYPE "public"."enum_realize_ai_data_operations_rollback_strategy";
  DROP TYPE "public"."enum_realize_ai_data_operation_approvals_type";
  DROP TYPE "public"."enum_realize_ai_data_operation_approvals_decision";
  DROP TYPE "public"."enum_realize_ai_data_operation_events_type";
  DROP TYPE "public"."enum_realize_ai_data_operation_events_delivery_status";`)
}
