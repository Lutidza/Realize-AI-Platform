/**
 * @file packages/payload-task-manager/src/server/audit-review/rework/auditRevisionSchema.sql
 * @version 1.0.0
 * @date 2026-11-25
 * @description Закрепляет единственную исправленную публикацию поручения за его решением и родительским результатом.
 * @see documentation/specifications/task-management/execution/article-audit-rework.md
 */
CREATE TABLE IF NOT EXISTS audit_dossier.revision_links (
  work_id uuid PRIMARY KEY REFERENCES audit_rework.claims(work_id),
  result_id uuid NOT NULL UNIQUE REFERENCES audit_dossier.published_events(result_id),
  parent_result_id uuid NOT NULL REFERENCES audit_dossier.results(result_id),
  parent_revision integer NOT NULL CHECK (parent_revision > 0),
  decision_id uuid NOT NULL REFERENCES audit_acceptance.decisions(decision_id),
  parent_conclusion_id uuid NOT NULL REFERENCES audit_conclusions.results(result_id),
  parent_conclusion_revision integer NOT NULL CHECK (parent_conclusion_revision > 0),
  parent_conclusion_sha text NOT NULL CHECK (length(parent_conclusion_sha)=64),
  iteration integer NOT NULL CHECK (iteration > 1),
  responses jsonb NOT NULL CHECK (jsonb_typeof(responses)='array' AND jsonb_array_length(responses)>0),
  CHECK (parent_result_id <> result_id)
);
CREATE OR REPLACE TRIGGER immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON audit_dossier.revision_links
  FOR EACH STATEMENT EXECUTE FUNCTION audit_dossier.reject_rewrite();
