/**
 * @file src/app/(system-admin)/system/task-manager/reference/page.tsx
 * @version 1.0.0
 * @date 2026-09-17
 * @description Открывает референс task manager только после серверной проверки администратора.
 * @see documentation/architecture/system-admin-shell.md
 */

import type { Metadata } from "next";
import { requireSystemAdmin } from "@/components/admin/system-shell/requireSystemAdmin.service";
import { SYSTEM_TASK_MANAGER_REFERENCE_ROUTE } from "@/components/admin/system-shell/systemAdmin.routes";
import { TaskManagerWorkbench } from "@/components/admin/task-manager/reference/TaskManagerWorkbench.component";

export const metadata: Metadata = {
  title: "Задачи — прототип | Realize",
  robots: { index: false, follow: false },
};

export default async function SystemTaskManagerReferencePage() {
  const context = await requireSystemAdmin(SYSTEM_TASK_MANAGER_REFERENCE_ROUTE);
  return <TaskManagerWorkbench initialTheme={context.initialTheme} />;
}
