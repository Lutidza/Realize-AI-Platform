import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_realize_ai_config_drafts_schema_version" AS ENUM('1.0');
  CREATE TYPE "public"."enum_realize_ai_config_drafts_state" AS ENUM('editing', 'validating', 'ready', 'released');
  CREATE TYPE "public"."enum_realize_ai_config_releases_schema_version" AS ENUM('1.0');
  CREATE TYPE "public"."enum_realize_ai_active_config_pointers_action" AS ENUM('activate', 'rollback');
  CREATE TYPE "public"."enum_realize_ai_config_events_action" AS ENUM('draft_created', 'draft_updated', 'draft_validated', 'release_created');
  CREATE TYPE "public"."enum_realize_ai_config_events_resource_kind" AS ENUM('draft', 'release');
  CREATE TYPE "public"."enum_realize_ai_config_events_status" AS ENUM('succeeded', 'validation_failed');
  CREATE TABLE "realize_ai_config_drafts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"draft_i_d" varchar NOT NULL,
  	"schema_version" "enum_realize_ai_config_drafts_schema_version" DEFAULT '1.0' NOT NULL,
  	"state" "enum_realize_ai_config_drafts_state" DEFAULT 'editing' NOT NULL,
  	"revision" numeric DEFAULT 1 NOT NULL,
  	"base_release_i_d" varchar,
  	"base_release_manifest_hash" varchar,
  	"artifacts" jsonb DEFAULT '[]'::jsonb NOT NULL,
  	"created_by_id" integer NOT NULL,
  	"updated_by_id" integer NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "realize_ai_config_releases" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"release_i_d" varchar NOT NULL,
  	"release_key" varchar NOT NULL,
  	"schema_version" "enum_realize_ai_config_releases_schema_version" DEFAULT '1.0' NOT NULL,
  	"version" numeric NOT NULL,
  	"source_draft_i_d" varchar NOT NULL,
  	"source_draft_revision" numeric NOT NULL,
  	"system_minimum_release" varchar NOT NULL,
  	"system_maximum_release" varchar,
  	"artifacts" jsonb DEFAULT '[]'::jsonb NOT NULL,
  	"manifest_hash" varchar NOT NULL,
  	"released_at" timestamp(3) with time zone NOT NULL,
  	"created_by_id" integer NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "realize_ai_active_config_pointers" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"pointer_key" varchar DEFAULT 'installation' NOT NULL,
  	"pointer_version_key" varchar NOT NULL,
  	"version" numeric NOT NULL,
  	"release_i_d" varchar NOT NULL,
  	"manifest_hash" varchar NOT NULL,
  	"action" "enum_realize_ai_active_config_pointers_action" NOT NULL,
  	"activated_at" timestamp(3) with time zone NOT NULL,
  	"activated_by_id" integer NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "realize_ai_config_events" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"idempotency_key" varchar NOT NULL,
  	"action" "enum_realize_ai_config_events_action" NOT NULL,
  	"actor_id" integer NOT NULL,
  	"request_hash" varchar NOT NULL,
  	"resource_kind" "enum_realize_ai_config_events_resource_kind" NOT NULL,
  	"resource_i_d" varchar NOT NULL,
  	"status" "enum_realize_ai_config_events_status" NOT NULL,
  	"response_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "realize_ai_config_drafts_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "realize_ai_config_releases_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "realize_ai_active_config_pointers_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "realize_ai_config_events_id" integer;
  ALTER TABLE "realize_ai_config_drafts" ADD CONSTRAINT "realize_ai_config_drafts_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "realize_ai_config_drafts" ADD CONSTRAINT "realize_ai_config_drafts_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "realize_ai_config_releases" ADD CONSTRAINT "realize_ai_config_releases_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "realize_ai_active_config_pointers" ADD CONSTRAINT "realize_ai_active_config_pointers_activated_by_id_users_id_fk" FOREIGN KEY ("activated_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "realize_ai_config_events" ADD CONSTRAINT "realize_ai_config_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE UNIQUE INDEX "realize_ai_config_drafts_draft_i_d_idx" ON "realize_ai_config_drafts" USING btree ("draft_i_d");
  CREATE INDEX "realize_ai_config_drafts_state_idx" ON "realize_ai_config_drafts" USING btree ("state");
  CREATE INDEX "realize_ai_config_drafts_base_release_i_d_idx" ON "realize_ai_config_drafts" USING btree ("base_release_i_d");
  CREATE INDEX "realize_ai_config_drafts_created_by_idx" ON "realize_ai_config_drafts" USING btree ("created_by_id");
  CREATE INDEX "realize_ai_config_drafts_updated_by_idx" ON "realize_ai_config_drafts" USING btree ("updated_by_id");
  CREATE INDEX "realize_ai_config_drafts_updated_at_idx" ON "realize_ai_config_drafts" USING btree ("updated_at");
  CREATE INDEX "realize_ai_config_drafts_created_at_idx" ON "realize_ai_config_drafts" USING btree ("created_at");
  CREATE UNIQUE INDEX "realize_ai_config_releases_release_i_d_idx" ON "realize_ai_config_releases" USING btree ("release_i_d");
  CREATE UNIQUE INDEX "realize_ai_config_releases_release_key_idx" ON "realize_ai_config_releases" USING btree ("release_key");
  CREATE INDEX "realize_ai_config_releases_version_idx" ON "realize_ai_config_releases" USING btree ("version");
  CREATE INDEX "realize_ai_config_releases_source_draft_i_d_idx" ON "realize_ai_config_releases" USING btree ("source_draft_i_d");
  CREATE INDEX "realize_ai_config_releases_manifest_hash_idx" ON "realize_ai_config_releases" USING btree ("manifest_hash");
  CREATE INDEX "realize_ai_config_releases_created_by_idx" ON "realize_ai_config_releases" USING btree ("created_by_id");
  CREATE INDEX "realize_ai_config_releases_updated_at_idx" ON "realize_ai_config_releases" USING btree ("updated_at");
  CREATE INDEX "realize_ai_config_releases_created_at_idx" ON "realize_ai_config_releases" USING btree ("created_at");
  CREATE INDEX "realize_ai_active_config_pointers_pointer_key_idx" ON "realize_ai_active_config_pointers" USING btree ("pointer_key");
  CREATE UNIQUE INDEX "realize_ai_active_config_pointers_pointer_version_key_idx" ON "realize_ai_active_config_pointers" USING btree ("pointer_version_key");
  CREATE INDEX "realize_ai_active_config_pointers_release_i_d_idx" ON "realize_ai_active_config_pointers" USING btree ("release_i_d");
  CREATE INDEX "realize_ai_active_config_pointers_activated_by_idx" ON "realize_ai_active_config_pointers" USING btree ("activated_by_id");
  CREATE INDEX "realize_ai_active_config_pointers_updated_at_idx" ON "realize_ai_active_config_pointers" USING btree ("updated_at");
  CREATE INDEX "realize_ai_active_config_pointers_created_at_idx" ON "realize_ai_active_config_pointers" USING btree ("created_at");
  CREATE UNIQUE INDEX "realize_ai_config_events_idempotency_key_idx" ON "realize_ai_config_events" USING btree ("idempotency_key");
  CREATE INDEX "realize_ai_config_events_action_idx" ON "realize_ai_config_events" USING btree ("action");
  CREATE INDEX "realize_ai_config_events_actor_idx" ON "realize_ai_config_events" USING btree ("actor_id");
  CREATE INDEX "realize_ai_config_events_request_hash_idx" ON "realize_ai_config_events" USING btree ("request_hash");
  CREATE INDEX "realize_ai_config_events_resource_i_d_idx" ON "realize_ai_config_events" USING btree ("resource_i_d");
  CREATE INDEX "realize_ai_config_events_updated_at_idx" ON "realize_ai_config_events" USING btree ("updated_at");
  CREATE INDEX "realize_ai_config_events_created_at_idx" ON "realize_ai_config_events" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_realize_ai_config_drafts_fk" FOREIGN KEY ("realize_ai_config_drafts_id") REFERENCES "public"."realize_ai_config_drafts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_realize_ai_config_releases_fk" FOREIGN KEY ("realize_ai_config_releases_id") REFERENCES "public"."realize_ai_config_releases"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_realize_ai_active_config_po_fk" FOREIGN KEY ("realize_ai_active_config_pointers_id") REFERENCES "public"."realize_ai_active_config_pointers"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_realize_ai_config_events_fk" FOREIGN KEY ("realize_ai_config_events_id") REFERENCES "public"."realize_ai_config_events"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_realize_ai_config_drafts_i_idx" ON "payload_locked_documents_rels" USING btree ("realize_ai_config_drafts_id");
  CREATE INDEX "payload_locked_documents_rels_realize_ai_config_releases_idx" ON "payload_locked_documents_rels" USING btree ("realize_ai_config_releases_id");
  CREATE INDEX "payload_locked_documents_rels_realize_ai_active_config_p_idx" ON "payload_locked_documents_rels" USING btree ("realize_ai_active_config_pointers_id");
  CREATE INDEX "payload_locked_documents_rels_realize_ai_config_events_i_idx" ON "payload_locked_documents_rels" USING btree ("realize_ai_config_events_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "realize_ai_config_drafts" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "realize_ai_config_releases" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "realize_ai_active_config_pointers" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "realize_ai_config_events" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_realize_ai_config_drafts_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_realize_ai_config_releases_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_realize_ai_active_config_po_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_realize_ai_config_events_fk";
  
  DROP INDEX "payload_locked_documents_rels_realize_ai_config_drafts_i_idx";
  DROP INDEX "payload_locked_documents_rels_realize_ai_config_releases_idx";
  DROP INDEX "payload_locked_documents_rels_realize_ai_active_config_p_idx";
  DROP INDEX "payload_locked_documents_rels_realize_ai_config_events_i_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "realize_ai_config_drafts_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "realize_ai_config_releases_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "realize_ai_active_config_pointers_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "realize_ai_config_events_id";
  DROP TABLE "realize_ai_config_drafts" CASCADE;
  DROP TABLE "realize_ai_config_releases" CASCADE;
  DROP TABLE "realize_ai_active_config_pointers" CASCADE;
  DROP TABLE "realize_ai_config_events" CASCADE;
  DROP TYPE "public"."enum_realize_ai_config_drafts_schema_version";
  DROP TYPE "public"."enum_realize_ai_config_drafts_state";
  DROP TYPE "public"."enum_realize_ai_config_releases_schema_version";
  DROP TYPE "public"."enum_realize_ai_active_config_pointers_action";
  DROP TYPE "public"."enum_realize_ai_config_events_action";
  DROP TYPE "public"."enum_realize_ai_config_events_resource_kind";
  DROP TYPE "public"."enum_realize_ai_config_events_status";`)
}
