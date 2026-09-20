/**
 * @file src/components/admin/task-manager/reference/TaskCreationTabs.component.tsx
 * @version 1.0.0
 * @date 2026-09-19
 * @description Объединяет существующие формы вкладками сущностей с защитой черновика.
 * @see documentation/specifications/task-management.md
 */
import { CheckSquare, Folder, FolderKanban, Layers, List } from "lucide-react";
import { UiButton, UiDialog, UiTabs } from "@realize/ui-kit";
import type { TaskCreationTabsProps } from "./TaskCreation.types";
import { useTaskCreationTabs } from "./useTaskCreationTabs.hook";
import { taskWorkbenchMessages } from "./taskWorkbench.messages";

export function TaskCreationTabs(props: TaskCreationTabsProps) {
  const t = taskWorkbenchMessages[props.locale].createPanel;
  const navigation = useTaskCreationTabs(props);
  const kinds = [
    { id: "task", label: t.task, icon: <CheckSquare size={16} /> },
    { id: "project", label: t.project, icon: <FolderKanban size={16} /> },
    { id: "folder", label: t.folder, icon: <Folder size={16} /> },
    { id: "list", label: t.list, icon: <List size={16} /> },
    { id: "workspace", label: t.workspace, icon: <Layers size={16} /> },
  ];
  return (
    <>
      <UiTabs
        label={t.kind}
        appearance="underline"
        value={props.kind}
        onValueChange={navigation.change}
        items={kinds.map((item) => ({
          ...item,
          content: item.id === props.kind ? props.children : null,
        }))}
      />
      <UiDialog
        open={Boolean(navigation.pending)}
        onOpenChange={(open) => {
          if (!open) navigation.cancel();
        }}
        mode={props.theme}
        size="compact"
        title={t.discardTitle}
        description={t.discardDescription}
        footer={
          <>
            <UiButton variant="ghost" onClick={navigation.cancel}>
              {t.continue}
            </UiButton>
            <UiButton variant="danger" onClick={navigation.discard}>
              {t.discard}
            </UiButton>
          </>
        }
      />
    </>
  );
}
