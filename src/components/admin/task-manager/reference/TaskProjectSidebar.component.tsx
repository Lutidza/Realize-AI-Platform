/**
 * @file src/components/admin/task-manager/reference/TaskProjectSidebar.component.tsx
 * @version 3.3.1
 * @date 2026-10-12
 * @description Собирает контекст рабочей среды, общие группы и одноуровневый навигатор проектов.
 * @see documentation/specifications/task-management-execution.md
 * @see documentation/architecture/system-admin-shell.md
 */

import {
  Archive,
  Eye,
  EyeOff,
  FolderPlus,
  LayoutDashboard,
  LayoutGrid,
  Layers,
  ListPlus,
  Plus,
  RotateCcw,
} from "lucide-react";
import { UiButton, UiSearchInput } from "@realize/ui-kit";
import {
  SystemAdminItemMenu,
  SystemAdminNavigationGroups,
  SystemAdminNavigationSection,
} from "@realize/template-realize/ui";
import { TaskHierarchyTree } from "./TaskHierarchyTree.component";
import { TaskHierarchyToolbar } from "./TaskHierarchyToolbar.component";
import { useTaskHierarchy } from "./useTaskHierarchy.hook";
import type { TaskProjectSidebarProps } from "./TaskHierarchy.types";
import styles from "./TaskHierarchy.module.css";

/** Обе поверхности используют общие группы UI-kit и один store; browse не закрывает оболочку. */
export function TaskProjectSidebar(props: TaskProjectSidebarProps) {
  const {
    location,
    archived,
    onSelect,
    onCatalog,
    catalogActive,
    onCreate,
    onArchive,
    onReset,
    onOverview,
    variant = "sidebar",
    onLocationSettings,
    onLocationDelete,
    onLocationVisibility,
  } = props;
  const hierarchy = useTaskHierarchy(props);
  const { workspace, workspaceLocation, context, parent, root } = hierarchy;
  return (
    <div className={styles.sidebar} data-variant={variant} data-task-hierarchy>
      <SystemAdminNavigationGroups
        onNavigate={() => undefined}
        groups={[
          {
            id: "task-navigation",
            label: "Навигация задач",
            items: [
              {
                id: "task-workspaces",
                label: "Рабочие среды",
                icon: <LayoutGrid size={20} />,
                onSelect: onCatalog,
                active: catalogActive,
                favoriteable: false,
              },
              ...(onOverview && workspace
                ? [
                    {
                      id: `task-overview-workspace-${workspace.id}`,
                      label: "Обзор задач",
                      icon: <LayoutDashboard size={20} />,
                      onSelect: onOverview,
                    },
                  ]
                : []),
              ...(workspaceLocation
                ? [
                    {
                      id: `task-location-workspace-${workspaceLocation.id}`,
                      label: "Все задачи",
                      active:
                        !catalogActive &&
                        !archived &&
                        location.kind === "workspace" &&
                        location.id === workspaceLocation.id,
                      icon: <Layers size={20} />,
                      onSelect: () => onSelect(workspaceLocation),
                    },
                  ]
                : []),
            ],
          },
        ]}
      />
      <SystemAdminNavigationSection
        label={root ? "Проекты" : "Разделы"}
        action={
          <SystemAdminItemMenu
            label="Разделы"
            triggerLabel="Добавить или настроить разделы"
            triggerIcon={<Plus size={16} aria-hidden="true" />}
            alwaysVisible
            side="right"
            align="start"
            actions={[
              ...hierarchy.creationOptions.map((option) => ({
                id: option.creation.kind,
                label: option.label,
                opensDialog: true,
                icon:
                  option.creation.kind === "folder" ? (
                    <FolderPlus size={16} />
                  ) : option.creation.kind === "list" ? (
                    <ListPlus size={16} />
                  ) : (
                    <Plus size={16} />
                  ),
                onSelect: () => onCreate(option.creation),
              })),
              ...(hierarchy.hiddenCount || hierarchy.showHidden
                ? [
                    {
                      id: "hidden",
                      label: hierarchy.showHidden
                        ? "Не показывать скрытые"
                        : `Показать скрытые (${hierarchy.hiddenCount})`,
                      icon: hierarchy.showHidden ? (
                        <EyeOff size={16} />
                      ) : (
                        <Eye size={16} />
                      ),
                      onSelect: () =>
                        hierarchy.setShowHidden(!hierarchy.showHidden),
                    },
                  ]
                : []),
            ]}
          />
        }
      >
        <TaskHierarchyToolbar
          context={context}
          parent={parent}
          onBrowse={hierarchy.browse}
          onSelect={onSelect}
          onSettings={onLocationSettings}
          onDelete={onLocationDelete}
          onVisibility={onLocationVisibility}
          hidden={hierarchy.contextHidden}
          canWrite={hierarchy.canWrite}
        />
        <UiSearchInput
          className={styles.search}
          density="compact"
          value={hierarchy.query}
          onChange={(event) => hierarchy.setQuery(event.target.value)}
          aria-label={root ? "Найти проект" : "Найти список или папку"}
          placeholder={root ? "Найти проект" : "Найти в этом разделе"}
        />
        <TaskHierarchyTree
          navigationRef={hierarchy.navigationRef}
          nodes={hierarchy.nodes}
          emptyText={
            hierarchy.query.trim()
              ? "Ничего не найдено. Измените запрос."
              : root
                ? "Пока нет проектов. Создайте первый кнопкой + выше."
                : "Здесь пока пусто. Добавьте список или папку."
          }
          location={location}
          archived={archived}
          onBrowse={hierarchy.browse}
          onSelect={onSelect}
          onSettings={onLocationSettings}
          onDelete={onLocationDelete}
          onVisibility={onLocationVisibility}
          canWrite={hierarchy.canWrite}
        />
      </SystemAdminNavigationSection>
      <SystemAdminNavigationSection label="Управление">
        <SystemAdminNavigationGroups
          onNavigate={() => undefined}
          groups={[
            {
              id: "task-management",
              label: "Управление задачами",
              items: [
                {
                  id: `task-archive-workspace-${workspace?.id ?? "empty"}`,
                  label: "Архив",
                  active: archived,
                  icon: <Archive size={20} />,
                  favoriteable: false,
                  onSelect: onArchive,
                },
              ],
            },
          ]}
        />
      </SystemAdminNavigationSection>
      {variant === "sidebar" ? (
        <div className={styles.bottom}>
          <p className={styles.demoNote}>
            Демонстрационные данные. Изменения сохраняются до перезагрузки.
          </p>
          <UiButton variant="ghost" size="small" onClick={onReset}>
            <RotateCcw size={14} aria-hidden="true" />
            Сбросить демо
          </UiButton>
        </div>
      ) : null}
    </div>
  );
}
