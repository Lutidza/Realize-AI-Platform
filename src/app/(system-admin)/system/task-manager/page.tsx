/**
 * @file src/app/(system-admin)/system/task-manager/page.tsx
 * @version 1.2.0
 * @date 2026-10-12
 * @description Открывает постоянные задачи после проверки серверной сессии администратора.
 * @see documentation/specifications/task-management-execution.md
 */
import type { Metadata } from "next";
import { requireSystemAdmin } from "@/components/admin/system-shell/requireSystemAdmin.service";
import { SystemAdminTemplateProvider } from "@/components/admin/system-shell/SystemAdminTemplateProvider.component";
import { SYSTEM_TASK_MANAGER_ROUTE } from "@/components/admin/system-shell/systemAdmin.routes";
import { TaskManagerWorkbench } from "@/components/admin/task-manager/TaskManagerWorkbench.component";

export const metadata: Metadata = {
  title: "Задачи | Realize",
  robots: { index: false, follow: false },
};

export default async function SystemTaskManagerPage() {
  const context = await requireSystemAdmin(SYSTEM_TASK_MANAGER_ROUTE);
  return (
    <SystemAdminTemplateProvider
      selection={context.appearance.selection}
      settings={context.appearance.settings}
      initialMode={context.initialTheme}
    >
      <TaskManagerWorkbench {...context} />
    </SystemAdminTemplateProvider>
  );
}
