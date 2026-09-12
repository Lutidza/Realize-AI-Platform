import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_realize_ai_data_operations_kind" ADD VALUE 'pages.createDraft.v1';
  ALTER TYPE "public"."enum_realize_ai_data_operations_rollback_strategy" ADD VALUE 'delete-created-draft';
  ALTER TABLE "realize_ai_data_operations" ALTER COLUMN "product_id" DROP NOT NULL;
  ALTER TABLE "realize_ai_data_operations" ALTER COLUMN "category_id" DROP NOT NULL;
  ALTER TABLE "realize_ai_data_operations" ALTER COLUMN "product_snapshot" DROP NOT NULL;
  ALTER TABLE "realize_ai_data_operations" ALTER COLUMN "category_snapshot" DROP NOT NULL;
  ALTER TABLE "realize_ai_data_operations" ALTER COLUMN "expected_target_updated_at" DROP NOT NULL;
  ALTER TABLE "realize_ai_data_operations" ADD COLUMN "applied_snapshot" jsonb;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "realize_ai_data_operations" ALTER COLUMN "kind" SET DATA TYPE text;
  DROP TYPE "public"."enum_realize_ai_data_operations_kind";
  CREATE TYPE "public"."enum_realize_ai_data_operations_kind" AS ENUM('catalog.assignCategory.v1');
  ALTER TABLE "realize_ai_data_operations" ALTER COLUMN "kind" SET DATA TYPE "public"."enum_realize_ai_data_operations_kind" USING "kind"::"public"."enum_realize_ai_data_operations_kind";
  ALTER TABLE "realize_ai_data_operations" ALTER COLUMN "rollback_strategy" SET DATA TYPE text;
  ALTER TABLE "realize_ai_data_operations" ALTER COLUMN "rollback_strategy" SET DEFAULT 'before-snapshot'::text;
  DROP TYPE "public"."enum_realize_ai_data_operations_rollback_strategy";
  CREATE TYPE "public"."enum_realize_ai_data_operations_rollback_strategy" AS ENUM('before-snapshot');
  ALTER TABLE "realize_ai_data_operations" ALTER COLUMN "rollback_strategy" SET DEFAULT 'before-snapshot'::"public"."enum_realize_ai_data_operations_rollback_strategy";
  ALTER TABLE "realize_ai_data_operations" ALTER COLUMN "rollback_strategy" SET DATA TYPE "public"."enum_realize_ai_data_operations_rollback_strategy" USING "rollback_strategy"::"public"."enum_realize_ai_data_operations_rollback_strategy";
  ALTER TABLE "realize_ai_data_operations" ALTER COLUMN "product_id" SET NOT NULL;
  ALTER TABLE "realize_ai_data_operations" ALTER COLUMN "category_id" SET NOT NULL;
  ALTER TABLE "realize_ai_data_operations" ALTER COLUMN "product_snapshot" SET NOT NULL;
  ALTER TABLE "realize_ai_data_operations" ALTER COLUMN "category_snapshot" SET NOT NULL;
  ALTER TABLE "realize_ai_data_operations" ALTER COLUMN "expected_target_updated_at" SET NOT NULL;
  ALTER TABLE "realize_ai_data_operations" DROP COLUMN "applied_snapshot";`)
}
