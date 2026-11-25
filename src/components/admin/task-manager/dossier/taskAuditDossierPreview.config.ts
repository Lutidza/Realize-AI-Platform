/**
 * @file src/components/admin/task-manager/dossier/taskAuditDossierPreview.config.ts
 * @version 1.0.0
 * @date 2026-11-26
 * @description Ограничивает просмотр выделенным стендом и задаёт ссылку актуального проверочного запуска.
 * @see documentation/specifications/task-management/execution/article-audit-dossier-preview.md
 */
import "server-only";
import { taskAuditDossierRoute } from "./taskAuditDossier.routes";
export function isAuditDossierPreviewEnabled() {
  return (
    process.env.REALIZE_AI_RUNTIME_ISOLATED === "true" &&
    process.env.REALIZE_AUDIT_DOSSIER_PREVIEW === "true"
  );
}
export function currentAuditDossierLink() {
  const taskId = process.env.REALIZE_AUDIT_DOSSIER_TASK_ID;
  const decisionId = process.env.REALIZE_AUDIT_DOSSIER_DECISION_ID;
  if (!isAuditDossierPreviewEnabled() || !taskId || !decisionId)
    return undefined;
  return { taskId, href: taskAuditDossierRoute(taskId, decisionId) };
}
