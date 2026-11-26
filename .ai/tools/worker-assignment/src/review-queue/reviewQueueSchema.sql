-- @file .ai/tools/worker-assignment/src/review-queue/reviewQueueSchema.sql
-- @version 1.0.2
-- @date 2026-11-26
-- @description Создаёт приватную очередь ревью с единственной выдачей работы по ключу назначения.
-- @see documentation/specifications/task-management/execution/audit-report-publication.md
SELECT pg_advisory_xact_lock(hashtextextended('audit_review_runtime.schema', 0));
CREATE SCHEMA IF NOT EXISTS audit_review_runtime;
REVOKE ALL ON SCHEMA audit_review_runtime FROM PUBLIC;
CREATE TABLE IF NOT EXISTS audit_review_runtime.jobs (
  dispatch_key text PRIMARY KEY,
  job_id uuid UNIQUE NOT NULL,
  delivery jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  claimed_by text,
  consumer_id text,
  review_attempt_id uuid UNIQUE,
  claimed_at timestamptz,
  CHECK ((claimed_by IS NULL AND consumer_id IS NULL AND review_attempt_id IS NULL AND claimed_at IS NULL)
      OR (claimed_by IS NOT NULL AND consumer_id IS NOT NULL AND review_attempt_id IS NOT NULL AND claimed_at IS NOT NULL))
);
REVOKE ALL ON audit_review_runtime.jobs FROM PUBLIC;
