/**
 * @file src/components/admin/task-manager/reference/taskWorkbench.constants.ts
 * @version 1.0.1
 * @date 2026-09-18
 * @description Задаёт доступные представления и колонки рабочей среды.
 */

import {
  LayoutDashboard,
  List,
  Columns3,
  Table2,
  Workflow,
  MessageSquare,
} from "lucide-react";
import type { TaskColumn, TaskFilters } from "./TaskWorkbench.types";

export const defaultTaskFilters: TaskFilters = {
  query: "",
  priority: "all",
  status: "all",
  actor: "all",
  sort: "default",
};
export const taskViewOptions = [
  { id: "overview", label: "Обзор", icon: LayoutDashboard },
  { id: "list", label: "Список", icon: List },
  { id: "board", label: "Доска", icon: Columns3 },
  { id: "table", label: "Таблица", icon: Table2 },
  { id: "queue", label: "Очередь AI", icon: Workflow },
  { id: "dialogs", label: "Диалоги", icon: MessageSquare },
] as const;
export const taskColumnOptions: { id: TaskColumn; label: string }[] = [
  { id: "people", label: "Исполнители" },
  { id: "due", label: "Срок" },
  { id: "priority", label: "Приоритет" },
  { id: "progress", label: "Чеклисты" },
  { id: "run", label: "AI исполнение" },
];
