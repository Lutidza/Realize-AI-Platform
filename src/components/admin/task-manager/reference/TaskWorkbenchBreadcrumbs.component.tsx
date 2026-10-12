/**
 * @file src/components/admin/task-manager/reference/TaskWorkbenchBreadcrumbs.component.tsx
 * @version 1.0.1
 * @date 2026-10-12
 * @description Связывает контекстный заголовок с соседними контейнерами, аватарками и guarded settings.
 * @see documentation/architecture/system-admin-shell.md
 */
import { Archive, Settings2 } from "lucide-react";
import { UiBadge, UiEntityMark } from "@realize/ui-kit";
import { SystemAdminBreadcrumbs } from "@realize/template-realize/ui";
import { getLocationPath } from "./taskManager.hierarchy";
import { getTaskLocationSiblings } from "./taskBreadcrumbs.selectors";
import { getTaskLocationAppearance } from "./taskLocationAppearance";
import { TaskLocationMark } from "./TaskLocationMark.component";
import { taskWorkbenchMessages } from "./taskWorkbench.messages";
import type { TaskWorkbenchBreadcrumbsProps } from "./TaskHierarchy.types";

export function TaskWorkbenchBreadcrumbs({
  state,
  location,
  archived,
  locale,
  onSelect,
  onSettings,
}: TaskWorkbenchBreadcrumbsProps) {
  const t = taskWorkbenchMessages[locale];
  const path = getLocationPath(state, location);
  const appearance = getTaskLocationAppearance(state, location);
  const items = path.map((part, index) => ({
    id: `${part.kind}:${part.id}`,
    label: part.name,
    icon: (
      <TaskLocationMark appearance={getTaskLocationAppearance(state, part)} />
    ),
    onSelect: () => onSelect(part),
    parentLabel: path[index - 1]?.name ?? t.workspaces,
    choices: getTaskLocationSiblings(state, part).map((sibling) => ({
      id: `${sibling.kind}:${sibling.id}`,
      label: sibling.name,
      icon: (
        <TaskLocationMark
          appearance={getTaskLocationAppearance(state, sibling)}
        />
      ),
      onSelect: () => onSelect(sibling),
    })),
    actions: [
      {
        id: `settings:${part.kind}:${part.id}`,
        label: t.kindSettings[part.kind],
        icon: <Settings2 size={16} aria-hidden="true" />,
        onSelect: () => onSettings(part),
      },
    ],
  }));
  return (
    <SystemAdminBreadcrumbs
      locale={locale}
      label={t.taskLocation}
      currentAsHeading
      currentBadge={
        <UiBadge accent={archived ? "rose" : appearance.accent}>
          {archived ? t.archiveBadge : t.kinds[location.kind]}
        </UiBadge>
      }
      items={
        archived
          ? [
              ...items,
              {
                id: "archive",
                label: t.archive,
                icon: (
                  <UiEntityMark
                    label={t.archive}
                    accent="rose"
                    icon={<Archive size={14} aria-hidden="true" />}
                  />
                ),
                onSelect: () => undefined,
              },
            ]
          : items
      }
    />
  );
}
