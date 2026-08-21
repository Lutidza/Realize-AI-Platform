import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "realize_ai_conversations" ADD COLUMN "idempotency_key" varchar;
  UPDATE "realize_ai_conversations"
    SET "idempotency_key" = 'legacy:' || "id"::text
    WHERE "idempotency_key" IS NULL;
  ALTER TABLE "realize_ai_conversations" ALTER COLUMN "idempotency_key" SET NOT NULL;
  CREATE UNIQUE INDEX "realize_ai_conversations_idempotency_key_idx" ON "realize_ai_conversations" USING btree ("idempotency_key");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "realize_ai_conversations_idempotency_key_idx";
  ALTER TABLE "realize_ai_conversations" DROP COLUMN "idempotency_key";`)
}
