import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_realize_ai_worker_presence_state" AS ENUM('idle', 'busy', 'draining', 'stopped', 'error');
  CREATE TYPE "public"."enum_realize_ai_worker_presence_current_kind" AS ENUM('execution', 'preview', 'sourcePromotion', 'release');
  CREATE TABLE "realize_ai_worker_presence" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"instance_key" varchar NOT NULL,
  	"state" "enum_realize_ai_worker_presence_state" NOT NULL,
  	"last_seen_at" timestamp(3) with time zone NOT NULL,
  	"capabilities" jsonb NOT NULL,
  	"current_kind" "enum_realize_ai_worker_presence_current_kind",
  	"current_change_request" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE UNIQUE INDEX "realize_ai_worker_presence_instance_key_idx" ON "realize_ai_worker_presence" USING btree ("instance_key");
  CREATE INDEX "realize_ai_worker_presence_last_seen_at_idx" ON "realize_ai_worker_presence" USING btree ("last_seen_at");
  CREATE INDEX "realize_ai_worker_presence_updated_at_idx" ON "realize_ai_worker_presence" USING btree ("updated_at");
  CREATE INDEX "realize_ai_worker_presence_created_at_idx" ON "realize_ai_worker_presence" USING btree ("created_at");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "realize_ai_worker_presence" CASCADE;
  DROP TYPE "public"."enum_realize_ai_worker_presence_state";
  DROP TYPE "public"."enum_realize_ai_worker_presence_current_kind";`)
}
