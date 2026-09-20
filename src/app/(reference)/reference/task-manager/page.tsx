/**
 * @file src/app/(reference)/reference/task-manager/page.tsx
 * @version 1.0.0
 * @date 2026-09-17
 * @description Открывает публичный референс исключительно с демонстрационными данными.
 * @see documentation/specifications/task-management.md
 */

import type { Metadata } from "next";
import { TaskManagerWorkbench } from "@/components/admin/task-manager/reference/TaskManagerWorkbench.component";

export const metadata: Metadata = {
  title: "Task manager — прототип · Realize",
  robots: { index: false, follow: false },
};

export default function TaskManagerReferencePage() {
  return <TaskManagerWorkbench />;
}
