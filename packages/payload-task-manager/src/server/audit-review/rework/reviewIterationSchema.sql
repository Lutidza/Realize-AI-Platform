/**
 * @file packages/payload-task-manager/src/server/audit-review/rework/reviewIterationSchema.sql
 * @version 1.0.1
 * @date 2026-11-26
 * @description Хранит точные входы повторного ревью и независимые квитанции доставки этих входов в очередь.
 * @see documentation/specifications/task-management/execution/review-rework.md
 */
CREATE TABLE IF NOT EXISTS audit_rework.review_routes(
  work_id uuid PRIMARY KEY REFERENCES audit_rework.claims,
  execution_id text NOT NULL REFERENCES audit_review.executions,
  plan_revision integer NOT NULL,
  iteration integer NOT NULL CHECK (iteration > 1),
  envelope jsonb NOT NULL,
  basis jsonb NOT NULL,
  UNIQUE(execution_id,plan_revision,iteration)
);
CREATE TABLE IF NOT EXISTS audit_rework.review_acknowledgements(
  work_id uuid PRIMARY KEY REFERENCES audit_rework.review_routes,
  job_id uuid NOT NULL UNIQUE,
  accepted_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE OR REPLACE TRIGGER immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON audit_rework.review_routes
  FOR EACH STATEMENT EXECUTE FUNCTION audit_dossier.reject_rewrite();
CREATE OR REPLACE TRIGGER immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON audit_rework.review_acknowledgements
  FOR EACH STATEMENT EXECUTE FUNCTION audit_dossier.reject_rewrite();
