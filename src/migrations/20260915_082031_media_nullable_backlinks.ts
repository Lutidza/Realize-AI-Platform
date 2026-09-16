import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "media_originals" ALTER COLUMN "media_id" DROP NOT NULL;
  ALTER TABLE "media_processing_sets" ALTER COLUMN "media_id" DROP NOT NULL;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "media_originals" ALTER COLUMN "media_id" SET NOT NULL;
  ALTER TABLE "media_processing_sets" ALTER COLUMN "media_id" SET NOT NULL;`)
}
