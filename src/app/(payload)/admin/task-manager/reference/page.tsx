/**
 * @file src/app/(payload)/admin/task-manager/reference/page.tsx
 * @version 1.0.0
 * @date 2026-10-12
 * @description Сохраняет прежний URL эталона как переход к единственному защищённому reference.
 * @see documentation/architecture/system-admin-shell.md
 */
import { redirect } from "next/navigation";
import { SYSTEM_TASK_MANAGER_REFERENCE_ROUTE } from "@/components/admin/system-shell/systemAdmin.routes";

/** Данные и проверка Admin остаются у целевой страницы; здесь второй UI не создаётся. */
export default function TaskManagerReferenceEntryPage() {
  redirect(SYSTEM_TASK_MANAGER_REFERENCE_ROUTE);
}
