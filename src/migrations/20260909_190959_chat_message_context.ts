/**
 * @file src/migrations/20260909_190959_chat_message_context.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Добавляет приватные вложения и сохраняемый контекст сообщений чата.
 */

import {
  type MigrateUpArgs,
  type MigrateDownArgs,
  sql,
} from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_realize_ai_chat_attachments_kind" AS ENUM('image', 'text');
  CREATE TABLE "realize_ai_chat_attachments" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"asset_i_d" varchar NOT NULL,
  	"created_by_id" integer NOT NULL,
  	"name" varchar NOT NULL,
  	"mime_type" varchar NOT NULL,
  	"size" numeric NOT NULL,
  	"kind" "enum_realize_ai_chat_attachments_kind" NOT NULL,
  	"sha256" varchar NOT NULL,
  	"expires_at" timestamp(3) with time zone NOT NULL,
  	"run_i_d" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "realize_ai_messages" ALTER COLUMN "content" DROP NOT NULL;
  ALTER TABLE "realize_ai_messages" ADD COLUMN "turn_context" jsonb;
  ALTER TABLE "realize_ai_messages" ADD COLUMN "sources" jsonb;
  ALTER TABLE "realize_ai_runs" ADD COLUMN "request_hash" varchar;
  ALTER TABLE "realize_ai_runs" ADD COLUMN "turn_context" jsonb;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "realize_ai_chat_attachments_id" integer;
  ALTER TABLE "realize_ai_chat_attachments" ADD CONSTRAINT "realize_ai_chat_attachments_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE UNIQUE INDEX "realize_ai_chat_attachments_asset_i_d_idx" ON "realize_ai_chat_attachments" USING btree ("asset_i_d");
  CREATE INDEX "realize_ai_chat_attachments_created_by_idx" ON "realize_ai_chat_attachments" USING btree ("created_by_id");
  CREATE INDEX "realize_ai_chat_attachments_expires_at_idx" ON "realize_ai_chat_attachments" USING btree ("expires_at");
  CREATE INDEX "realize_ai_chat_attachments_run_i_d_idx" ON "realize_ai_chat_attachments" USING btree ("run_i_d");
  CREATE INDEX "realize_ai_chat_attachments_updated_at_idx" ON "realize_ai_chat_attachments" USING btree ("updated_at");
  CREATE INDEX "realize_ai_chat_attachments_created_at_idx" ON "realize_ai_chat_attachments" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_realize_ai_chat_attachments_fk" FOREIGN KEY ("realize_ai_chat_attachments_id") REFERENCES "public"."realize_ai_chat_attachments"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_realize_ai_chat_attachment_idx" ON "payload_locked_documents_rels" USING btree ("realize_ai_chat_attachments_id");`);
}

/** Откат схемы удаляет новый контекст; откат приложения не требует запуска down. */
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_realize_ai_chat_attachments_fk";
  
  DROP INDEX "payload_locked_documents_rels_realize_ai_chat_attachment_idx";
  UPDATE "realize_ai_messages" SET "content" = '' WHERE "content" IS NULL;
  ALTER TABLE "realize_ai_messages" ALTER COLUMN "content" SET NOT NULL;
  ALTER TABLE "realize_ai_messages" DROP COLUMN "turn_context";
  ALTER TABLE "realize_ai_messages" DROP COLUMN "sources";
  ALTER TABLE "realize_ai_runs" DROP COLUMN "request_hash";
  ALTER TABLE "realize_ai_runs" DROP COLUMN "turn_context";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "realize_ai_chat_attachments_id";
  DROP TABLE "realize_ai_chat_attachments";
  DROP TYPE "public"."enum_realize_ai_chat_attachments_kind";`);
}
