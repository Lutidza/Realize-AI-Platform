/**
 * @file packages/payload-task-manager/src/server/audit-review/planSchema.sql
 * @version 1.1.2
 * @date 2026-11-26
 * @description Хранит исполнения, ревизии плана, назначения и разрешения участников в отдельной PostgreSQL.
 * @see documentation/specifications/task-management/execution/audit-report-publication.md
 */
CREATE SCHEMA IF NOT EXISTS audit_review;
REVOKE ALL ON SCHEMA audit_review FROM PUBLIC;

CREATE TABLE IF NOT EXISTS audit_review.executions (
  execution_id text PRIMARY KEY,
  task_id text NOT NULL REFERENCES public.realize_tasks(task_id),
  project_id text NOT NULL,
  active_revision integer CHECK (active_revision > 0)
);

CREATE TABLE IF NOT EXISTS audit_review.plans (
  execution_id text NOT NULL REFERENCES audit_review.executions,
  plan_revision integer NOT NULL CHECK (plan_revision > 0),
  task_revision integer NOT NULL CHECK (task_revision > 0),
  audit_attempt_id text NOT NULL UNIQUE,
  implementation_author_id text NOT NULL,
  source_pins jsonb NOT NULL,
  scope_pins jsonb NOT NULL,
  review_iteration integer NOT NULL CHECK (review_iteration > 0),
  PRIMARY KEY (execution_id, plan_revision)
);

CREATE TABLE IF NOT EXISTS audit_review.assignments (
  execution_id text NOT NULL,
  plan_revision integer NOT NULL,
  role text NOT NULL CHECK (role IN ('auditor', 'reviewer')),
  stage_id text NOT NULL,
  assignment_id text NOT NULL,
  assignment_revision integer NOT NULL CHECK (assignment_revision > 0),
  actor_id text NOT NULL,
  withdrawn boolean NOT NULL DEFAULT false,
  PRIMARY KEY (execution_id, plan_revision, role),
  UNIQUE (execution_id, plan_revision, stage_id),
  UNIQUE (execution_id, plan_revision, assignment_id),
  FOREIGN KEY (execution_id, plan_revision) REFERENCES audit_review.plans
);

-- Грант даёт право на два материала и точный набор source_pins только этой ревизии.
CREATE TABLE IF NOT EXISTS audit_review.read_grants (
  execution_id text NOT NULL,
  plan_revision integer NOT NULL,
  actor_id text NOT NULL,
  allowed boolean NOT NULL,
  PRIMARY KEY (execution_id, plan_revision, actor_id),
  FOREIGN KEY (execution_id, plan_revision) REFERENCES audit_review.plans
);

-- У плана один действующий маршрут повторного ревью. Историю и версии входа хранит владелец выдачи.
CREATE TABLE IF NOT EXISTS audit_review.iteration_heads (
  execution_id text NOT NULL,
  plan_revision integer NOT NULL,
  work_id uuid NOT NULL UNIQUE,
  iteration integer NOT NULL CHECK (iteration > 1),
  PRIMARY KEY(execution_id,plan_revision),
  FOREIGN KEY(execution_id,plan_revision) REFERENCES audit_review.plans
);
