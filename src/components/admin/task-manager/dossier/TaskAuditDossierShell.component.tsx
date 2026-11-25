/**
 * @file src/components/admin/task-manager/dossier/TaskAuditDossierShell.component.tsx
 * @version 1.0.0
 * @date 2026-11-26
 * @description Помещает досье в текущую оболочку задач и предоставляет навигацию по трём материалам.
 * @see documentation/specifications/task-management/execution/article-audit-dossier-preview.md
 */
"use client";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { SystemAdminTemplateHost } from "../../system-shell/SystemAdminTemplateHost.component";
import { getSystemAdminNavigation } from "../../system-shell/systemAdmin.navigation";
import { SYSTEM_TASK_MANAGER_ROUTE } from "../../system-shell/systemAdmin.routes";
import { useSystemAdminTheme } from "../../system-shell/useSystemAdminTheme.hook";
import type { SystemAdminThemeOptions } from "../../system-shell/systemAdmin.types";
import styles from "./TaskAuditDossier.module.css";
import { auditDossierSections } from "./taskAuditDossier.constants";

export function TaskAuditDossierShell(
  props: SystemAdminThemeOptions & { children: ReactNode },
) {
  const { theme, setTheme } = useSystemAdminTheme(props);
  const router = useRouter();
  const tasks = () => router.push(SYSTEM_TASK_MANAGER_ROUTE);
  const contents = (
    <nav className={styles.contents} aria-label="Материалы досье">
      <h2>Досье задачи</h2>
      {auditDossierSections.map(({ anchor, label }) => (
        <a key={anchor} href={`#${anchor}`}>
          {label}
        </a>
      ))}
    </nav>
  );
  return (
    <SystemAdminTemplateHost
      screen="workspace"
      mode={theme}
      onModeChange={setTheme}
      navigation={getSystemAdminNavigation({
        onTasks: tasks,
        tasksPanel: contents,
      })}
      activeNavigationId="tasks"
      secondaryNavigation={contents}
      breadcrumbs={[{ id: "tasks", label: "Задачи", onSelect: tasks }]}
    >
      {props.children}
    </SystemAdminTemplateHost>
  );
}
