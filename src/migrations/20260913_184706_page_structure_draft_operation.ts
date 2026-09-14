import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_realize_ai_data_operations_kind" ADD VALUE 'pages.updateStructureDraft.v1';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "realize_ai_data_operations" ALTER COLUMN "kind" SET DATA TYPE text;
  DROP TYPE "public"."enum_realize_ai_data_operations_kind";
  CREATE TYPE "public"."enum_realize_ai_data_operations_kind" AS ENUM('catalog.assignCategory.v1', 'pages.createDraft.v1', 'pages.updateDraft.v1');
  ALTER TABLE "realize_ai_data_operations" ALTER COLUMN "kind" SET DATA TYPE "public"."enum_realize_ai_data_operations_kind" USING "kind"::"public"."enum_realize_ai_data_operations_kind";`)
}
