/**
 * @file packages/payload-task-manager/src/server/audit-review/conclusions/reviewAcceptanceSchema.sql
 * @version 1.0.1
 * @date 2026-11-26
 * @description Хранит действующее основание приёмки, доставки оркестратору, решения и адресованные доработки.
 * @see documentation/specifications/task-management/execution/review-conclusion.md
 */
CREATE SCHEMA IF NOT EXISTS audit_acceptance;
REVOKE ALL ON SCHEMA audit_acceptance FROM PUBLIC;
CREATE TABLE IF NOT EXISTS audit_acceptance.bases (
  execution_id text PRIMARY KEY REFERENCES audit_review.executions(execution_id),
  revision integer NOT NULL CHECK (revision > 0),
  grantor_id text NOT NULL,
  basis jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS audit_acceptance.inbox (
  conclusion_id uuid PRIMARY KEY REFERENCES audit_conclusions.published_events(result_id),
  actor_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE IF NOT EXISTS audit_acceptance.decisions (
  conclusion_id uuid PRIMARY KEY REFERENCES audit_acceptance.inbox(conclusion_id),
  decision_id uuid NOT NULL UNIQUE,
  manifest jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS audit_acceptance.work (
  work_id uuid PRIMARY KEY,
  decision_id uuid NOT NULL UNIQUE REFERENCES audit_acceptance.decisions(decision_id),
  record jsonb NOT NULL
);
CREATE OR REPLACE TRIGGER immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON audit_acceptance.inbox
  FOR EACH STATEMENT EXECUTE FUNCTION audit_dossier.reject_rewrite();
CREATE OR REPLACE TRIGGER immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON audit_acceptance.decisions
  FOR EACH STATEMENT EXECUTE FUNCTION audit_dossier.reject_rewrite();
CREATE OR REPLACE TRIGGER immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON audit_acceptance.work
  FOR EACH STATEMENT EXECUTE FUNCTION audit_dossier.reject_rewrite();
