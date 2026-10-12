/**
 * @file src/app/(system-admin)/system/task-manager/reference/page.tsx
 * @version 1.2.0
 * @date 2026-10-12
 * @description Открывает референс task manager только после серверной проверки администратора.
 * @see documentation/architecture/system-admin-shell.md
 */

import type { Metadata } from "next";
import { requireSystemAdmin } from "@/components/admin/system-shell/requireSystemAdmin.service";
import { SYSTEM_TASK_MANAGER_REFERENCE_ROUTE } from "@/components/admin/system-shell/systemAdmin.routes";
import { TaskManagerWorkbench } from "@/components/admin/task-manager/reference/TaskManagerWorkbench.component";
import { SystemAdminTemplateProvider } from "@/components/admin/system-shell/SystemAdminTemplateProvider.component";
import { systemAdminReferenceAppearance } from "@/components/admin/system-shell/systemAdminReferenceAppearance.config";

export const metadata: Metadata = {
  title: "Задачи — прототип | Realize",
  robots: { index: false, follow: false },
};

export default async function SystemTaskManagerReferencePage() {
  const context = await requireSystemAdmin(
    SYSTEM_TASK_MANAGER_REFERENCE_ROUTE,
    { appearance: "reference" },
  );
  return (
    <SystemAdminTemplateProvider
      {...systemAdminReferenceAppearance}
      initialMode={context.initialTheme}
    >
      <TaskManagerWorkbench initialTheme={context.initialTheme} />
    </SystemAdminTemplateProvider>
  );
}
