/**
 * @file .ai/tools/worker-assignment/src/checkpoints/checkpointSchema.sql
 * @version 1.0.0
 * @date 2026-11-25
 * @description Создаёт закрытую схему одноразовой базы для неизменяемых ревизий и квитанций аудита.
 * @see documentation/specifications/task-management/execution/article-audit-storage-pilot.md
 */
CREATE SCHEMA IF NOT EXISTS audit_checkpoint;
REVOKE ALL ON SCHEMA audit_checkpoint FROM PUBLIC;

CREATE TABLE IF NOT EXISTS audit_checkpoint.attempts (
  attempt_id text PRIMARY KEY CHECK (attempt_id <> ''),
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  fence bigint NOT NULL DEFAULT 0 CHECK (fence >= 0),
  owner_id text,
  expires_at timestamptz,
  CHECK ((owner_id IS NULL) = (expires_at IS NULL))
);

-- text сохраняет порядок ключей и точные сериализованные сообщения для повторной проверки SHA-256.
CREATE TABLE IF NOT EXISTS audit_checkpoint.revisions (
  attempt_id text NOT NULL REFERENCES audit_checkpoint.attempts(attempt_id),
  revision integer NOT NULL CHECK (revision >= 0),
  state_bytes text NOT NULL,
  state_sha256 text NOT NULL CHECK (length(state_sha256) = 64),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (attempt_id, revision)
);

CREATE TABLE IF NOT EXISTS audit_checkpoint.receipts (
  attempt_id text NOT NULL,
  revision integer NOT NULL,
  call_id text NOT NULL CHECK (call_id <> ''),
  request_id text NOT NULL CHECK (request_id <> ''),
  receipt_bytes text NOT NULL,
  PRIMARY KEY (attempt_id, call_id),
  UNIQUE (attempt_id, revision),
  UNIQUE (attempt_id, request_id),
  FOREIGN KEY (attempt_id, revision) REFERENCES audit_checkpoint.revisions(attempt_id, revision)
);

CREATE OR REPLACE FUNCTION audit_checkpoint.reject_rewrite()
RETURNS trigger LANGUAGE plpgsql AS $body$
BEGIN
  RAISE EXCEPTION 'checkpoint_immutable';
END;
$body$;

CREATE OR REPLACE TRIGGER revision_immutable
  BEFORE UPDATE OR DELETE OR TRUNCATE ON audit_checkpoint.revisions
  FOR EACH STATEMENT EXECUTE FUNCTION audit_checkpoint.reject_rewrite();
CREATE OR REPLACE TRIGGER receipt_immutable
  BEFORE UPDATE OR DELETE OR TRUNCATE ON audit_checkpoint.receipts
  FOR EACH STATEMENT EXECUTE FUNCTION audit_checkpoint.reject_rewrite();
