/**
 * @file .ai/tools/worker-assignment/test/dossier-preview/previewReader.sql
 * @version 1.1.0
 * @date 2026-11-26
 * @description Выдаёт отдельному SQL-читателю предпросмотра доступ к материалам решения и источникам проверки полномочий.
 * @see documentation/specifications/task-management/execution/article-audit-dossier-preview.md
 * @see documentation/specifications/task-management/execution/article-audit-conclusion.md
 */
DO $provision$
BEGIN
  IF current_database() <> 'realize_checkpoint_pilot' THEN
    RAISE EXCEPTION 'audit_database_mismatch';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'realize_dossier_reader') THEN
    CREATE ROLE realize_dossier_reader LOGIN NOSUPERUSER NOCREATEROLE NOCREATEDB NOREPLICATION NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'realize_dossier_web') THEN
    CREATE ROLE realize_dossier_web LOGIN INHERIT NOSUPERUSER NOCREATEROLE NOCREATEDB NOREPLICATION NOBYPASSRLS;
  END IF;
END;
$provision$;
REVOKE ALL ON DATABASE realize_checkpoint_pilot FROM PUBLIC;
GRANT CONNECT ON DATABASE realize_checkpoint_pilot TO realize_dossier_reader;
ALTER ROLE realize_dossier_reader SET default_transaction_read_only = on;
GRANT USAGE ON SCHEMA public,audit_review,audit_acceptance,audit_conclusions,audit_dossier,audit_rework TO realize_dossier_reader;
GRANT SELECT ON public.realize_tasks,public.realize_task_projects,
  audit_review.executions,audit_review.plans,audit_review.assignments,
  audit_acceptance.bases,audit_acceptance.inbox,audit_acceptance.decisions,audit_acceptance.work,
  audit_conclusions.results,audit_conclusions.successors,
  audit_dossier.results,audit_dossier.deliveries,audit_dossier.preview_report_materials,audit_dossier.revision_links,
  audit_rework.review_routes TO realize_dossier_reader;

-- Payload открывает сессии через собственный SQL-логин. В аудитных схемах ему доступно только чтение.
GRANT realize_dossier_reader TO realize_dossier_web;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO realize_dossier_web;
GRANT INSERT,UPDATE,DELETE ON public.users_sessions TO realize_dossier_web;
-- Payload сохраняет сессию через INSERT ... ON CONFLICT (id) DO UPDATE.
GRANT INSERT,UPDATE ON public.users TO realize_dossier_web;
CREATE OR REPLACE FUNCTION public.preview_login_fields_only() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path=pg_catalog AS $login$
BEGIN
  IF TG_OP='INSERT' AND current_user='realize_dossier_web' THEN
    RAISE EXCEPTION 'preview_web_account_creation_denied' USING ERRCODE='42501';
  END IF;
  IF current_user='realize_dossier_web' AND
     (to_jsonb(NEW) - ARRAY['updated_at','login_attempts','lock_until']) IS DISTINCT FROM
     (to_jsonb(OLD) - ARRAY['updated_at','login_attempts','lock_until']) THEN
    RAISE EXCEPTION 'preview_web_account_change_denied' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END;
$login$;
CREATE OR REPLACE TRIGGER preview_login_fields BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.preview_login_fields_only();
-- AFTER INSERT срабатывает только для фактически добавленной строки, в отличие от BEFORE INSERT при upsert.
CREATE OR REPLACE TRIGGER preview_login_existing_only AFTER INSERT ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.preview_login_fields_only();

-- При upsert Payload также пересохраняет массив ролей. На стенде роли назначает seed.
-- Для web любое пересохранение этого массива оставляет исходные строки целыми.
GRANT INSERT,DELETE ON public.users_roles TO realize_dossier_web;
GRANT USAGE ON SEQUENCE public.users_roles_id_seq TO realize_dossier_web;
CREATE OR REPLACE FUNCTION public.preview_preserve_login_roles() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path=pg_catalog AS $roles$
BEGIN
  RETURN NULL;
END;
$roles$;
CREATE OR REPLACE TRIGGER preview_preserve_login_roles BEFORE INSERT OR DELETE ON public.users_roles
  FOR EACH ROW WHEN (current_user = 'realize_dossier_web') EXECUTE FUNCTION public.preview_preserve_login_roles();
