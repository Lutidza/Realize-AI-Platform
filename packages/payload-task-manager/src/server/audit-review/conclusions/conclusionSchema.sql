/**
 * @file packages/payload-task-manager/src/server/audit-review/conclusions/conclusionSchema.sql
 * @version 1.1.3
 * @date 2026-11-26
 * @description Хранит неизменяемые заключения ревью и события для оркестратора в закрытой схеме приёмки.
 * @see documentation/specifications/task-management/execution/review-conclusion.md
 * @see documentation/specifications/task-management/execution/review-rework.md
 */
CREATE SCHEMA IF NOT EXISTS audit_conclusions;
REVOKE ALL ON SCHEMA audit_conclusions FROM PUBLIC;

-- Основание выдаётся один раз до появления квитанций чтения этой попытки.
CREATE TABLE IF NOT EXISTS audit_conclusions.attempt_bases (
  review_attempt_id text PRIMARY KEY,
  job_id text NOT NULL,
  reviewer_id text NOT NULL,
  audit_result_id uuid NOT NULL REFERENCES audit_dossier.results(result_id),
  delivery jsonb NOT NULL,
  basis jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS audit_conclusions.results (
  result_id uuid PRIMARY KEY,
  task_id text NOT NULL,
  audit_result_id uuid NOT NULL REFERENCES audit_dossier.results(result_id),
  review_attempt_id text NOT NULL UNIQUE REFERENCES audit_conclusions.attempt_bases(review_attempt_id),
  content_sha256 text NOT NULL,
  manifest text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (encode(sha256(convert_to(manifest, 'UTF8')), 'hex') = content_sha256)
);
CREATE INDEX IF NOT EXISTS audit_conclusions_by_task
  ON audit_conclusions.results(task_id, created_at);

-- Событие публикации становится доступно только вместе с единственной версией по поручению.
CREATE TABLE IF NOT EXISTS audit_conclusions.successors (
  work_id uuid PRIMARY KEY,
  parent_id uuid NOT NULL UNIQUE REFERENCES audit_conclusions.results(result_id),
  conclusion_id uuid NOT NULL UNIQUE REFERENCES audit_conclusions.results(result_id),
  CHECK (parent_id <> conclusion_id)
);

CREATE TABLE IF NOT EXISTS audit_conclusions.published_events (
  result_id uuid PRIMARY KEY REFERENCES audit_conclusions.results(result_id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE OR REPLACE TRIGGER immutable
  BEFORE UPDATE OR DELETE OR TRUNCATE ON audit_conclusions.attempt_bases
  FOR EACH STATEMENT EXECUTE FUNCTION audit_dossier.reject_rewrite();
CREATE OR REPLACE TRIGGER immutable
  BEFORE UPDATE OR DELETE OR TRUNCATE ON audit_conclusions.results
  FOR EACH STATEMENT EXECUTE FUNCTION audit_dossier.reject_rewrite();
CREATE OR REPLACE TRIGGER immutable
  BEFORE UPDATE OR DELETE OR TRUNCATE ON audit_conclusions.successors
  FOR EACH STATEMENT EXECUTE FUNCTION audit_dossier.reject_rewrite();
CREATE OR REPLACE TRIGGER immutable
  BEFORE UPDATE OR DELETE OR TRUNCATE ON audit_conclusions.published_events
  FOR EACH STATEMENT EXECUTE FUNCTION audit_dossier.reject_rewrite();
