/**
 * @file packages/payload-task-manager/src/server/audit-review/rework/reworkClaimSchema.sql
 * @version 1.0.1
 * @date 2026-11-26
 * @description Хранит квитанции получения поручений и передачи их результатов на повторное ревью.
 * @see documentation/specifications/task-management/execution/review-rework.md
 */
CREATE SCHEMA IF NOT EXISTS audit_rework;
REVOKE ALL ON SCHEMA audit_rework FROM PUBLIC;
CREATE TABLE IF NOT EXISTS audit_rework.claims (
  work_id uuid PRIMARY KEY REFERENCES audit_acceptance.work,
  actor_id text NOT NULL,
  attempt_id uuid NOT NULL UNIQUE,
  claimed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE IF NOT EXISTS audit_rework.completed (
  work_id uuid PRIMARY KEY REFERENCES audit_rework.claims,
  completed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS audit_work_by_assignee ON audit_acceptance.work ((record->>'assigneeId'),work_id);
CREATE OR REPLACE TRIGGER immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON audit_rework.claims
  FOR EACH STATEMENT EXECUTE FUNCTION audit_dossier.reject_rewrite();
CREATE OR REPLACE TRIGGER immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON audit_rework.completed
  FOR EACH STATEMENT EXECUTE FUNCTION audit_dossier.reject_rewrite();
