/**
 * @file packages/payload-task-manager/src/server/audit-review/conclusions/reviewEvidenceSchema.sql
 * @version 1.0.0
 * @date 2026-11-25
 * @description Хранит неизменяемые квитанции выдачи строк ревьюеру по версии источника в досье.
 * @see documentation/specifications/task-management/execution/article-audit-conclusion.md
 */
CREATE SCHEMA IF NOT EXISTS audit_review_evidence;
REVOKE ALL ON SCHEMA audit_review_evidence FROM PUBLIC;

CREATE TABLE IF NOT EXISTS audit_review_evidence.reads (
  receipt_id uuid PRIMARY KEY,
  result_id uuid NOT NULL,
  review_attempt_id text NOT NULL,
  actor_id text NOT NULL,
  path text NOT NULL,
  sha text NOT NULL REFERENCES audit_dossier.materials,
  start_line integer NOT NULL CHECK (start_line > 0),
  end_line integer NOT NULL CHECK (end_line >= start_line),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (result_id, path) REFERENCES audit_dossier.sources
);

CREATE OR REPLACE TRIGGER immutable
  BEFORE UPDATE OR DELETE OR TRUNCATE ON audit_review_evidence.reads
  FOR EACH STATEMENT EXECUTE FUNCTION audit_dossier.reject_rewrite();
