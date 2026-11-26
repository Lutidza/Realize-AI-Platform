/**
 * @file packages/payload-task-manager/src/server/audit-review/dossierSchema.sql
 * @version 2.0.2
 * @date 2026-11-26
 * @description Создаёт закрытые таблицы досье и журнал публикации аудита в выделенной тестовой БД.
 * @see documentation/specifications/task-management/execution/audit-report-publication.md
 */
CREATE SCHEMA IF NOT EXISTS audit_dossier;
REVOKE ALL ON SCHEMA audit_dossier FROM PUBLIC;

CREATE TABLE IF NOT EXISTS audit_dossier.results (
  result_id uuid PRIMARY KEY,
  task_id text NOT NULL,
  origin text NOT NULL CHECK (origin = 'worker-assignment'),
  attempt_id text NOT NULL,
  manifest text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE UNIQUE INDEX IF NOT EXISTS results_origin_attempt_id_key ON audit_dossier.results(origin, attempt_id);
-- Обновление прежней таблицы сохраняет result_id и все ссылки на опубликованные материалы.
DO $upgrade$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_attribute WHERE attrelid='audit_dossier.results'::regclass
      AND attname='slot' AND NOT attisdropped
  ) THEN
    ALTER TABLE audit_dossier.results DROP COLUMN slot;
  END IF;
END;
$upgrade$;
CREATE INDEX IF NOT EXISTS audit_dossier_results_by_task ON audit_dossier.results(task_id, created_at);

CREATE TABLE IF NOT EXISTS audit_dossier.materials (
  sha text PRIMARY KEY,
  bytes bytea NOT NULL,
  CHECK (encode(sha256(bytes), 'hex') = sha)
);
CREATE TABLE IF NOT EXISTS audit_dossier.artifacts (
  artifact_id uuid NOT NULL,
  revision integer NOT NULL CHECK (revision > 0),
  result_id uuid NOT NULL REFERENCES audit_dossier.results,
  kind text NOT NULL CHECK (kind IN ('report','coverage')),
  sha text NOT NULL REFERENCES audit_dossier.materials,
  PRIMARY KEY (artifact_id, revision),
  UNIQUE (result_id, kind)
);
-- В предыдущей схеме у каждого artifact ID была только версия 1. Существующие ссылки и байты сохраняются.
DO $upgrade$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'audit_dossier.artifacts'::regclass
      AND contype='p' AND pg_get_constraintdef(oid)='PRIMARY KEY (artifact_id)'
  ) THEN
    ALTER TABLE audit_dossier.artifacts
      DROP CONSTRAINT artifacts_pkey,
      DROP CONSTRAINT artifacts_revision_check,
      ADD PRIMARY KEY (artifact_id,revision),
      ADD CONSTRAINT artifacts_revision_check CHECK (revision > 0);
  END IF;
END;
$upgrade$;
CREATE TABLE IF NOT EXISTS audit_dossier.sources (
  result_id uuid NOT NULL REFERENCES audit_dossier.results,
  path text NOT NULL,
  sha text NOT NULL REFERENCES audit_dossier.materials,
  PRIMARY KEY (result_id, path)
);

-- Сервер просмотра может получить SELECT только на опубликованный текст отчётов.
CREATE OR REPLACE VIEW audit_dossier.preview_report_materials
WITH (security_barrier = true) AS
SELECT a.artifact_id, a.revision, a.result_id, a.sha, m.bytes
FROM audit_dossier.artifacts a JOIN audit_dossier.materials m USING(sha)
WHERE a.kind = 'report';
REVOKE ALL ON audit_dossier.preview_report_materials FROM PUBLIC;

-- У одной версии результата ровно одно событие. После исправления его получает диспетчер итераций.
CREATE TABLE IF NOT EXISTS audit_dossier.published_events (
  result_id uuid PRIMARY KEY REFERENCES audit_dossier.results,
  lane text NOT NULL DEFAULT 'initial' CHECK (lane IN ('initial', 'rework')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
-- Все события до появления повторных публикаций обслуживал исходный диспетчер.
DO $upgrade$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute WHERE attrelid='audit_dossier.published_events'::regclass
      AND attname='lane' AND NOT attisdropped
  ) THEN
    ALTER TABLE audit_dossier.published_events
      ADD COLUMN lane text NOT NULL DEFAULT 'initial' CHECK (lane IN ('initial','rework'));
  END IF;
END;
$upgrade$;
CREATE TABLE IF NOT EXISTS audit_dossier.deliveries (
  result_id uuid PRIMARY KEY REFERENCES audit_dossier.published_events,
  envelope text NOT NULL
);
CREATE TABLE IF NOT EXISTS audit_dossier.acknowledgements (
  result_id uuid PRIMARY KEY REFERENCES audit_dossier.deliveries,
  job_id text NOT NULL UNIQUE CHECK (length(job_id) > 0),
  accepted_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE OR REPLACE FUNCTION audit_dossier.reject_rewrite()
RETURNS trigger LANGUAGE plpgsql AS $body$
BEGIN
  RAISE EXCEPTION 'audit_dossier_immutable';
END;
$body$;
DO $body$
DECLARE
  relation text;
BEGIN
  FOREACH relation IN ARRAY ARRAY['results','materials','artifacts','sources','published_events','deliveries','acknowledgements'] LOOP
    EXECUTE format('CREATE OR REPLACE TRIGGER immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON audit_dossier.%I FOR EACH STATEMENT EXECUTE FUNCTION audit_dossier.reject_rewrite()', relation);
  END LOOP;
END;
$body$;
