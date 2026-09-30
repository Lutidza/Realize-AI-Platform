import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql.raw("ALTER TYPE \"public\".\"enum_realize_design_revisions_channel\" ADD VALUE 'mcp';\nALTER TABLE \"realize_design_preview_jobs\" ADD COLUMN \"mcp_authorization\" jsonb;"));
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql.raw("LOCK TABLE \"realize_design_revisions\", \"realize_design_preview_jobs\" IN ACCESS EXCLUSIVE MODE;\nDO $$ BEGIN\n  IF EXISTS (SELECT 1 FROM \"realize_design_revisions\" WHERE \"channel\" = 'mcp') OR EXISTS (SELECT 1 FROM \"realize_design_preview_jobs\" WHERE \"mcp_authorization\" IS NOT NULL) THEN\n    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'WORKSHOP_MCP_ROLLBACK_BLOCKED';\n  END IF;\nEND $$;\nALTER TABLE \"realize_design_revisions\" ALTER COLUMN \"channel\" SET DATA TYPE text;\nDROP TYPE \"public\".\"enum_realize_design_revisions_channel\";\nCREATE TYPE \"public\".\"enum_realize_design_revisions_channel\" AS ENUM('admin');\nALTER TABLE \"realize_design_revisions\" ALTER COLUMN \"channel\" SET DATA TYPE \"public\".\"enum_realize_design_revisions_channel\" USING \"channel\"::\"public\".\"enum_realize_design_revisions_channel\";\nALTER TABLE \"realize_design_preview_jobs\" DROP COLUMN \"mcp_authorization\";"));
}
