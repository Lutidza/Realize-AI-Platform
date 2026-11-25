/**
 * @file src/components/admin/task-manager/dossier/taskAuditDossier.constants.ts
 * @version 1.0.0
 * @date 2026-11-26
 * @description Задаёт подписи критериев и решений из контракта аудита формы статьи.
 * @see documentation/specifications/task-management/execution/article-audit-dossier-preview.md
 */
import type { TaskAuditDossierView } from "@realize/payload-task-manager/audit-review";
export const auditDossierSections = [
  { anchor: "audit-report", label: "Отчёт аудитора" },
  { anchor: "review-conclusion", label: "Заключение ревьюера" },
  { anchor: "acceptance-decision", label: "Решение оркестратора" },
] as const;
export const auditCriteriaLabels = {
  responsibilities: "Карта обязанностей",
  "create-chain": "Создание статьи",
  "verification-chain": "Проверка результата записи",
  "findings-and-limits": "Замечания и границы проверки",
} satisfies Record<
  TaskAuditDossierView["conclusion"]["assessments"][number]["criterion"],
  string
>;
export const decisionLabels = {
  accept_audit: "Аудит принят",
  return_audit: "Возвращён аудитору",
  clarify_reviewer: "Запрошено уточнение",
} satisfies Record<TaskAuditDossierView["decision"]["action"], string>;
