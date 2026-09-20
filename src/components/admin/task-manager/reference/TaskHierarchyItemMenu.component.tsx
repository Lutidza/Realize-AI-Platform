/**
 * @file src/components/admin/task-manager/reference/TaskHierarchyItemMenu.component.tsx
 * @version 1.0.0
 * @date 2026-09-18
 * @description Передаёт действия контейнера в общее меню навигации UI-kit.
 * @see documentation/architecture/system-admin-shell.md
 */
import { ArrowUpRight, Eye, EyeOff, Settings2, Trash2 } from "lucide-react";
import { SystemAdminItemMenu } from "@realize/ui-kit";
import { taskLocationNavigationId } from "./taskHierarchyManagement.selectors";
import type { TaskHierarchyItemMenuProps } from "./TaskHierarchy.types";

export function TaskHierarchyItemMenu({
  target,
  name,
  hidden,
  canWrite,
  onSelect,
  onSettings,
  onDelete,
  onVisibility,
}: TaskHierarchyItemMenuProps) {
  return (
    <SystemAdminItemMenu
      favoriteId={taskLocationNavigationId(target)}
      label={name}
      actions={[
        {
          id: "open",
          label: "Открыть",
          icon: <ArrowUpRight size={16} />,
          onSelect: () => onSelect(target),
        },
        {
          id: "settings",
          label: "Настройки",
          icon: <Settings2 size={16} />,
          onSelect: () => onSettings(target),
          opensDialog: true,
        },
        {
          id: "visibility",
          label: hidden ? "Показать в навигации" : "Скрыть из навигации",
          icon: hidden ? <Eye size={16} /> : <EyeOff size={16} />,
          onSelect: () => onVisibility(target),
        },
        ...(canWrite
          ? [
              {
                id: "delete",
                label: "Удалить",
                icon: <Trash2 size={16} />,
                danger: true,
                opensDialog: true,
                onSelect: () => onDelete(target),
              },
            ]
          : []),
      ]}
    />
  );
}
