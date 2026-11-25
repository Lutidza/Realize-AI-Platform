/**
 * @file src/components/admin/task-manager/dossier/taskAuditDossier.routes.ts
 * @version 1.0.0
 * @date 2026-11-26
 * @description Строит адрес досье конкретной задачи и решения оркестратора.
 * @see documentation/specifications/task-management/execution/article-audit-dossier-preview.md
 */
import { SYSTEM_TASK_MANAGER_ROUTE } from "../../system-shell/systemAdmin.routes";

export const taskAuditDossierRoute = (taskId: string, decisionId: string) =>
  SYSTEM_TASK_MANAGER_ROUTE +
  "/" +
  encodeURIComponent(taskId) +
  "/dossier/" +
  encodeURIComponent(decisionId);
