import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_realize_ai_config_events_action" ADD VALUE 'config_activated';
  ALTER TYPE "public"."enum_realize_ai_config_events_action" ADD VALUE 'config_rolled_back';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "realize_ai_config_events" ALTER COLUMN "action" SET DATA TYPE text;
  DROP TYPE "public"."enum_realize_ai_config_events_action";
  CREATE TYPE "public"."enum_realize_ai_config_events_action" AS ENUM('draft_created', 'draft_updated', 'draft_validated', 'release_created');
  ALTER TABLE "realize_ai_config_events" ALTER COLUMN "action" SET DATA TYPE "public"."enum_realize_ai_config_events_action" USING "action"::"public"."enum_realize_ai_config_events_action";`)
}
