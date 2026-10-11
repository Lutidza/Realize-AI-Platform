import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql.raw("ALTER TABLE \"realize_ai_change_requests\" ADD COLUMN \"execution_context\" jsonb;\nALTER TABLE \"realize_ai_execution_jobs\" ADD COLUMN \"execution_context\" jsonb;"));
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql.raw("LOCK TABLE \"realize_ai_change_requests\", \"realize_ai_execution_jobs\" IN ACCESS EXCLUSIVE MODE;\nDO $$ BEGIN\n  IF EXISTS (SELECT 1 FROM \"realize_ai_change_requests\" WHERE execution_context IS NOT NULL)\n    OR EXISTS (SELECT 1 FROM \"realize_ai_execution_jobs\" WHERE execution_context IS NOT NULL) THEN\n    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'AI_CONTEXT_ROLLBACK_BLOCKED';\n  END IF;\nEND $$;\nALTER TABLE \"realize_ai_change_requests\" DROP COLUMN \"execution_context\";\nALTER TABLE \"realize_ai_execution_jobs\" DROP COLUMN \"execution_context\";"));
}
