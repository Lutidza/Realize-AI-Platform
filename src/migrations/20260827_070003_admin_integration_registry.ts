import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_realize_ai_integrations_last_test_status" AS ENUM('never', 'passed', 'failed');
  CREATE TYPE "public"."enum_realize_ai_integration_events_action" AS ENUM('saved', 'tested', 'disconnected');
  CREATE TYPE "public"."enum_realize_ai_integration_events_status" AS ENUM('passed', 'failed');
  CREATE TABLE "realize_ai_integrations" (
	"id" serial PRIMARY KEY NOT NULL,
	"provider" varchar NOT NULL,
	"connection_key" varchar NOT NULL,
	"category" varchar NOT NULL,
	"display_name" varchar NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"configuration" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"credential_envelope" varchar,
	"credential_updated_at" timestamp(3) with time zone,
	"revision" numeric DEFAULT 1 NOT NULL,
	"last_test_status" "enum_realize_ai_integrations_last_test_status" DEFAULT 'never' NOT NULL,
	"last_tested_at" timestamp(3) with time zone,
	"last_error_code" varchar,
	"created_by_id" integer NOT NULL,
	"updated_by_id" integer NOT NULL,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "realize_ai_integration_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"provider" varchar NOT NULL,
	"connection_key" varchar NOT NULL,
	"idempotency_key" varchar NOT NULL,
	"action" "enum_realize_ai_integration_events_action" NOT NULL,
	"status" "enum_realize_ai_integration_events_status" NOT NULL,
	"actor_id" integer NOT NULL,
	"summary" varchar NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "realize_ai_integrations_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "realize_ai_integration_events_id" integer;
  ALTER TABLE "realize_ai_integrations" ADD CONSTRAINT "realize_ai_integrations_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "realize_ai_integrations" ADD CONSTRAINT "realize_ai_integrations_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "realize_ai_integration_events" ADD CONSTRAINT "realize_ai_integration_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "realize_ai_integrations_provider_idx" ON "realize_ai_integrations" USING btree ("provider");
  CREATE UNIQUE INDEX "realize_ai_integrations_connection_key_idx" ON "realize_ai_integrations" USING btree ("connection_key");
  CREATE INDEX "realize_ai_integrations_category_idx" ON "realize_ai_integrations" USING btree ("category");
  CREATE INDEX "realize_ai_integrations_enabled_idx" ON "realize_ai_integrations" USING btree ("enabled");
  CREATE INDEX "realize_ai_integrations_created_by_idx" ON "realize_ai_integrations" USING btree ("created_by_id");
  CREATE INDEX "realize_ai_integrations_updated_by_idx" ON "realize_ai_integrations" USING btree ("updated_by_id");
  CREATE INDEX "realize_ai_integrations_updated_at_idx" ON "realize_ai_integrations" USING btree ("updated_at");
  CREATE INDEX "realize_ai_integrations_created_at_idx" ON "realize_ai_integrations" USING btree ("created_at");
  CREATE INDEX "realize_ai_integration_events_provider_idx" ON "realize_ai_integration_events" USING btree ("provider");
  CREATE INDEX "realize_ai_integration_events_connection_key_idx" ON "realize_ai_integration_events" USING btree ("connection_key");
  CREATE UNIQUE INDEX "realize_ai_integration_events_idempotency_key_idx" ON "realize_ai_integration_events" USING btree ("idempotency_key");
  CREATE INDEX "realize_ai_integration_events_action_idx" ON "realize_ai_integration_events" USING btree ("action");
  CREATE INDEX "realize_ai_integration_events_actor_idx" ON "realize_ai_integration_events" USING btree ("actor_id");
  CREATE INDEX "realize_ai_integration_events_updated_at_idx" ON "realize_ai_integration_events" USING btree ("updated_at");
  CREATE INDEX "realize_ai_integration_events_created_at_idx" ON "realize_ai_integration_events" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_realize_ai_integrations_fk" FOREIGN KEY ("realize_ai_integrations_id") REFERENCES "public"."realize_ai_integrations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_realize_ai_integration_even_fk" FOREIGN KEY ("realize_ai_integration_events_id") REFERENCES "public"."realize_ai_integration_events"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_realize_ai_integrations_id_idx" ON "payload_locked_documents_rels" USING btree ("realize_ai_integrations_id");
  CREATE INDEX "payload_locked_documents_rels_realize_ai_integration_eve_idx" ON "payload_locked_documents_rels" USING btree ("realize_ai_integration_events_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_realize_ai_integrations_fk";
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_realize_ai_integration_even_fk";
  ALTER TABLE "realize_ai_integrations" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "realize_ai_integration_events" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "realize_ai_integrations" CASCADE;
  DROP TABLE "realize_ai_integration_events" CASCADE;
  DROP INDEX "payload_locked_documents_rels_realize_ai_integrations_id_idx";
  DROP INDEX "payload_locked_documents_rels_realize_ai_integration_eve_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "realize_ai_integrations_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "realize_ai_integration_events_id";
  DROP TYPE "public"."enum_realize_ai_integrations_last_test_status";
  DROP TYPE "public"."enum_realize_ai_integration_events_action";
  DROP TYPE "public"."enum_realize_ai_integration_events_status";`)
}
