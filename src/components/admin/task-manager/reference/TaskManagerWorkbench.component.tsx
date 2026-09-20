/**
 * @file src/components/admin/task-manager/reference/TaskManagerWorkbench.component.tsx
 * @version 3.4.0
 * @date 2026-09-19
 * @description Собирает реактивный референс задач в независимой системной оболочке Realize.
 * @see documentation/specifications/task-management.md
 * @see documentation/architecture/system-admin-shell.md
 */

"use client";

import { Plus } from "lucide-react";
import { getSystemAdminNavigation } from "../../system-shell/systemAdmin.navigation";
import { useSystemAdminNavigationPreferences } from "../../system-shell/useSystemAdminNavigationPreferences.hook";
import { useSystemAdminLocale } from "../../system-shell/useSystemAdminLocale.hook";
import { WorkspaceCatalog } from "./WorkspaceCatalog.component";
import { WorkspaceSettings } from "./WorkspaceSettings.component";
import { WorkspaceCreateDialog } from "./WorkspaceCreateDialog.component";
import { WorkspaceManagerDialogs } from "./WorkspaceManagerDialogs.component";
import { useWorkspaceManager } from "./useWorkspaceManager.hook";
import {
  SystemAdminShell,
  SystemAdminBreadcrumbs,
  UiButton,
  UiTabs,
} from "@realize/ui-kit";
import { TaskWorkbenchToolbar } from "./TaskWorkbenchToolbar.component";
import { TaskWorkbenchBreadcrumbs } from "./TaskWorkbenchBreadcrumbs.component";
import { prototypeActors } from "./taskManager.fixtures";
import { useTaskManagerStore } from "./useTaskManagerStore.hook";
import { useTaskWorkbench } from "./useTaskWorkbench.hook";
import { taskViewOptions } from "./taskWorkbench.constants";
import { taskWorkbenchMessages } from "./taskWorkbench.messages";
import { getTaskNavigationFavoriteLinks } from "./taskManager.navigationFavorites";
import type {
  TaskView,
  TaskManagerWorkbenchProps,
} from "./TaskWorkbench.types";
import { TaskProjectSidebar } from "./TaskProjectSidebar.component";
import { TaskViewToolbar } from "./TaskViewToolbar.component";
import { TaskViews } from "./TaskViews.component";
import { TaskOverview } from "./TaskOverview.component";
import { TaskQueue } from "./TaskQueue.component";
import { TaskConversations } from "./TaskConversations.component";
import { TaskCreateDialog } from "./TaskCreateDialog.component";
import { TaskHierarchyCreateDialog } from "./TaskHierarchyCreateDialog.component";
import { useTaskHierarchyManager } from "./useTaskHierarchyManager.hook";
import { TaskHierarchyManagerDialogs } from "./TaskHierarchyManagerDialogs.component";
import { TaskDetailDrawer } from "./TaskDetailDrawer.component";
import styles from "./TaskManagerWorkbench.module.css";
import workspaceStyles from "./Workspace.module.css";

/** Все представления получают один снимок store; команды возвращают результат синхронно. */
export function TaskManagerWorkbench({
  initialTheme = "light",
}: TaskManagerWorkbenchProps) {
  const { state, dispatch, getSnapshot } = useTaskManagerStore();
  const { locale, setLocale } = useSystemAdminLocale();
  const t = taskWorkbenchMessages[locale];
  const { navigationPreferences, onNavigationPreferencesChange } =
    useSystemAdminNavigationPreferences();
  const ui = useTaskWorkbench(
    state,
    prototypeActors,
    initialTheme,
    getSnapshot,
  );
  const manager = useWorkspaceManager(state, dispatch, (id) =>
    ui.navigateLocation({ kind: "workspace", id }),
  );
  const navigateLocation: typeof ui.navigateLocation = (...args) =>
    manager.openTasks(() => ui.navigateLocation(...args));
  const parentLocation = ui.path.at(-2);
  // Возврат следует текущей иерархии и сохраняет общий guard черновика настроек.
  const backAction =
    manager.screen === "catalog"
      ? {
          label: t.backToTasks,
          onSelect: () => manager.openTasks(() => undefined),
        }
      : manager.screen === "tasks" && ui.archived
        ? {
            label: t.backToTasks,
            onSelect: () => navigateLocation(ui.location),
          }
        : manager.screen === "tasks" && parentLocation
          ? {
              label: `${t.back}: ${parentLocation.name}`,
              onSelect: () => navigateLocation(parentLocation),
            }
          : {
              label: t.backToWorkspaces,
              onSelect: manager.openCatalog,
            };
  const hierarchyManager = useTaskHierarchyManager({
    state,
    dispatch,
    preferences: navigationPreferences,
    onPreferencesChange: onNavigationPreferencesChange,
    onDeleted: (parent, removed) => {
      if (
        removed.some(
          (part) =>
            part.kind === ui.location.kind && part.id === ui.location.id,
        )
      )
        navigateLocation(parent);
      ui.setSelected([]);
      if (
        ui.selectedTaskId &&
        !getSnapshot().tasks.some((task) => task.id === ui.selectedTaskId)
      )
        ui.closeTask();
    },
  });
  const createWorkspace = () =>
    manager.requestNavigation(() =>
      ui.setHierarchyCreation({ kind: "workspace" }),
    );
  const createLabel = ui.defaultList
    ? t.createTask
    : ui.emptyCreation.kind === "list"
      ? t.createList
      : t.createProject;
  const selectedTask =
    state.tasks.find((task) => task.id === ui.selectedTaskId) ?? null;
  const createSubtask = (parentId: string) => {
    ui.closeTask();
    ui.setCreation({ kind: "task", status: "backlog", parentId });
  };
  const renderNavigation = (
    onNavigate: () => void,
    variant: "sidebar" | "flyout" = "sidebar",
  ) => (
    <TaskProjectSidebar
      state={state}
      location={ui.location}
      archived={ui.archived}
      variant={variant}
      hiddenIds={hierarchyManager.hiddenIds}
      onLocationSettings={(location) =>
        manager.requestNavigation(() => hierarchyManager.edit(location))
      }
      onLocationDelete={(location) =>
        manager.requestNavigation(() =>
          hierarchyManager.requestDelete(location),
        )
      }
      onLocationVisibility={hierarchyManager.toggleVisibility}
      onCatalog={() => {
        manager.openCatalog();
        onNavigate();
      }}
      catalogActive={manager.screen !== "tasks"}
      onSelect={(location) => {
        navigateLocation(location);
        onNavigate();
      }}
      onOverview={() => {
        navigateLocation({ kind: "workspace", id: ui.workspaceId }, "overview");
        onNavigate();
      }}
      onCreate={(location) =>
        manager.requestNavigation(() => ui.setHierarchyCreation(location))
      }
      onArchive={() => {
        navigateLocation(
          { kind: "workspace", id: ui.workspaceId },
          "list",
          true,
        );
        onNavigate();
      }}
      onReset={() => {
        manager.openTasks(() => {
          dispatch({ type: "reset" });
          ui.navigate("p-realize");
        });
      }}
    />
  );
  const content = (
    <div className={styles.viewPanel}>
      <TaskViewToolbar
        allowColumns={ui.view === "list" || ui.view === "table"}
        filters={ui.filters}
        setFilters={ui.setFilters}
        actors={prototypeActors}
        count={ui.tasks.length}
        columns={ui.columns}
        setColumns={ui.setColumns}
        theme={ui.theme}
      />
      <div className={styles.viewContent}>
        {(ui.view === "list" || ui.view === "board" || ui.view === "table") && (
          <TaskViews
            key={`${ui.location.kind}:${ui.location.id}:${ui.archived}`}
            filtered={
              Boolean(ui.filters.query.trim()) ||
              ui.filters.priority !== "all" ||
              ui.filters.status !== "all" ||
              ui.filters.actor !== "all"
            }
            createLabel={createLabel}
            tasks={ui.tasks}
            allTasks={state.tasks}
            actors={prototypeActors}
            view={ui.view}
            columns={ui.columns}
            selected={ui.selected}
            onSelect={ui.setSelected}
            onOpenTask={ui.onOpenTask}
            onCreate={ui.createTask}
            onCreateSubtask={createSubtask}
            dispatch={dispatch}
          />
        )}
        {ui.view === "overview" && (
          <TaskOverview
            tasks={ui.tasks}
            onOpenTask={ui.onOpenTask}
            onQueue={() => ui.setView("queue")}
          />
        )}
        {ui.view === "queue" && (
          <TaskQueue
            tasks={ui.tasks.filter((task) => !task.archived)}
            state={state}
            actors={prototypeActors}
            onOpenTask={ui.onOpenTask}
            dispatch={dispatch}
          />
        )}
        {ui.view === "dialogs" && (
          <TaskConversations
            tasks={ui.tasks}
            state={state}
            onOpenTask={ui.onOpenTask}
          />
        )}
      </div>
    </div>
  );
  return (
    <>
      <SystemAdminShell
        locale={locale}
        theme={ui.theme}
        onThemeChange={ui.setTheme}
        navigation={getSystemAdminNavigation({
          onTasks: () =>
            navigateLocation({ kind: "workspace", id: ui.workspaceId }),
          tasksPanel: (onNavigate) => renderNavigation(onNavigate, "flyout"),
          tasksFavoriteLinks: getTaskNavigationFavoriteLinks(
            state,
            navigateLocation,
          ),
        })}
        activeNavigationId="tasks"
        navigationPreferences={navigationPreferences}
        onNavigationPreferencesChange={onNavigationPreferencesChange}
        backAction={backAction}
        breadcrumbs={
          manager.screen === "tasks" ? (
            <TaskWorkbenchBreadcrumbs
              state={state}
              location={ui.location}
              archived={ui.archived}
              locale={locale}
              onSelect={navigateLocation}
              onSettings={(location) => {
                if (location.kind === "workspace")
                  manager.openSettings(location.id);
                else
                  manager.requestNavigation(() =>
                    hierarchyManager.edit(location),
                  );
              }}
            />
          ) : (
            <SystemAdminBreadcrumbs
              locale={locale}
              label={t.taskLocation}
              items={[
                {
                  id: "catalog",
                  label: t.workspaces,
                  onSelect: manager.openCatalog,
                },
                ...(manager.screen === "settings"
                  ? [
                      {
                        id: "settings",
                        label: manager.workspace?.name ?? t.settings,
                        onSelect: () => undefined,
                      },
                    ]
                  : []),
              ]}
            />
          )
        }
        contentActions={
          manager.screen === "tasks" && (
            <UiButton
              className={styles.contextCreate}
              disabled={!ui.workspaceAccess.canWrite}
              data-create-task="true"
              onClick={() => ui.createTask()}
              aria-label={createLabel}
              title={createLabel}
            >
              <Plus size={17} aria-hidden="true" />
              <span>{createLabel}</span>
            </UiButton>
          )
        }
        toolbar={
          <TaskWorkbenchToolbar
            dispatch={dispatch}
            state={state}
            ui={ui}
            manager={manager}
            locale={locale}
            onLocaleChange={setLocale}
          />
        }
        secondaryNavigation={(onNavigate) => renderNavigation(onNavigate)}
        footer={
          <div className={styles.stateBar}>
            <span
              role="status"
              aria-live="polite"
              data-error={!state.lastResult.ok}
            >
              {state.notice || t.demo}
            </span>
            <span>ТЗ 0.9</span>
          </div>
        }
      >
        {manager.screen === "catalog" ? (
          <WorkspaceCatalog
            state={state}
            onCreate={createWorkspace}
            onOpen={(id) => navigateLocation({ kind: "workspace", id })}
            onSettings={manager.openSettings}
          />
        ) : manager.screen === "settings" ? (
          <WorkspaceSettings
            state={state}
            actors={prototypeActors}
            dispatch={dispatch}
            manager={manager}
            onQueue={() => {
              if (manager.workspace)
                navigateLocation(
                  { kind: "workspace", id: manager.workspace.id },
                  "queue",
                );
            }}
          />
        ) : (
          <div className={styles.workbench}>
            {!ui.workspaceAccess.canWrite && (
              <p className={workspaceStyles.accessNote}>
                {t.readOnly}{" "}
                {ui.workspaceAccess.canManage
                  ? t.restoreToEdit
                  : t.permissionsRequired}
              </p>
            )}
            <UiTabs
              appearance="underline"
              label={t.taskView}
              value={ui.view}
              onValueChange={(value) => {
                ui.setView(value as TaskView);
                ui.setSelected([]);
              }}
              items={taskViewOptions.map(({ id, icon: Icon }) => ({
                id,
                label: t.views[id],
                icon: <Icon size={16} />,
                content: ui.view === id ? content : null,
              }))}
            />
          </div>
        )}
      </SystemAdminShell>
      {ui.creation && (
        <TaskCreateDialog
          kind={ui.creation.kind}
          hierarchy={state}
          listId={ui.defaultList?.id}
          projectId={
            state.tasks.find((task) => task.id === ui.creation?.parentId)
              ?.projectId ??
            ui.defaultList?.projectId ??
            ui.projectId
          }
          initialStatus={ui.creation.status}
          parentId={ui.creation.parentId}
          theme={ui.theme}
          actors={prototypeActors}
          tasks={state.tasks}
          conversations={state.conversations}
          dispatch={dispatch}
          onClose={() => ui.setCreation(null)}
          onCreated={(id, _projectId, listId) => {
            ui.navigateLocation({ kind: "list", id: listId });
            ui.onOpenTask(id);
          }}
        />
      )}
      {ui.hierarchyCreation?.kind === "workspace" ? (
        <WorkspaceCreateDialog
          theme={ui.theme}
          dispatch={dispatch}
          onClose={() => ui.setHierarchyCreation(null)}
          onCreated={(id) => navigateLocation({ kind: "workspace", id })}
        />
      ) : (
        ui.hierarchyCreation && (
          <TaskHierarchyCreateDialog
            location={ui.hierarchyCreation}
            state={state}
            theme={ui.theme}
            dispatch={dispatch}
            onClose={() => ui.setHierarchyCreation(null)}
            onCreated={(location) => navigateLocation(location)}
          />
        )
      )}
      <WorkspaceManagerDialogs
        theme={ui.theme}
        manager={manager}
        lastResult={state.lastResult}
      />
      <TaskHierarchyManagerDialogs
        theme={ui.theme}
        manager={hierarchyManager}
      />
      <TaskDetailDrawer
        key={ui.selectedTaskId ? "open" : "closed"}
        task={selectedTask}
        state={state}
        actors={prototypeActors}
        theme={ui.theme}
        dispatch={dispatch}
        onClose={ui.closeTask}
        onOpenTask={ui.onOpenTask}
        onCreateSubtask={createSubtask}
      />
    </>
  );
}
