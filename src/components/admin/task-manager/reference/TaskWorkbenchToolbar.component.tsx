/**
 * @file src/components/admin/task-manager/reference/TaskWorkbenchToolbar.component.tsx
 * @version 1.2.1
 * @date 2026-10-12
 * @description Подключает данные и действующие команды task reference к общей верхней панели.
 * @see documentation/architecture/system-admin-shell.md
 */
import {
  CheckSquare,
  CircleUserRound,
  CreditCard,
  Folder,
  FolderPlus,
  Layers,
  LayoutGrid,
  List,
  ListPlus,
  LogOut,
  Plus,
  UserRoundPen,
  Wallet,
} from "lucide-react";
import { SystemAdminToolbar } from "@realize/template-realize/ui";
import { TaskCreationHub } from "./TaskCreationHub.component";
import { TaskAccountAvailabilityDialog } from "./TaskAccountAvailabilityDialog.component";
import type { TaskCreationKind } from "./TaskCreation.types";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher.component";
import { useTaskWorkbenchToolbar } from "./useTaskWorkbenchToolbar.hook";
import type { TaskWorkbenchToolbarProps } from "./TaskWorkbenchToolbar.types";
import { taskWorkbenchMessages } from "./taskWorkbench.messages";

export function TaskWorkbenchToolbar(props: TaskWorkbenchToolbarProps) {
  const { state, ui, manager, locale, onLocaleChange } = props;
  const t = taskWorkbenchMessages[locale];
  const toolbar = useTaskWorkbenchToolbar(props);
  const createActions = [
    {
      id: "task",
      label: t.creation.task,
      icon: <CheckSquare size={17} aria-hidden="true" />,
    },
    {
      id: "project",
      label: t.creation.project,
      icon: <FolderPlus size={17} aria-hidden="true" />,
    },
    {
      id: "folder",
      label: t.creation.folder,
      icon: <Folder size={17} aria-hidden="true" />,
    },
    {
      id: "list",
      label: t.creation.list,
      icon: <ListPlus size={17} aria-hidden="true" />,
    },
    {
      id: "workspace",
      label: t.creation.workspace,
      icon: <Layers size={17} aria-hidden="true" />,
    },
  ].map((action) => ({
    ...action,
    onSelect: () => toolbar.openCreation(action.id as TaskCreationKind),
  }));
  return (
    <>
      <SystemAdminToolbar
        locale={locale}
        onLocaleChange={onLocaleChange}
        context={
          <WorkspaceSwitcher
            variant="toolbar"
            locale={locale}
            state={state}
            workspace={toolbar.workspace}
            onSelect={toolbar.selectWorkspace}
            onCreate={() => toolbar.create({ kind: "workspace" })}
            onCatalog={manager.openCatalog}
            onSettings={toolbar.openSettings}
          />
        }
        theme={ui.theme}
        onThemeChange={ui.setTheme}
        searchEntries={[
          {
            id: "command:workspaces",
            label: t.allWorkspaces,
            group: t.commands,
            icon: <LayoutGrid size={17} aria-hidden="true" />,
            onSelect: manager.openCatalog,
          },
          ...createActions.map((action) => ({
            ...action,
            id: `command:create:${action.id}`,
            label: `${t.create} ${action.label.toLocaleLowerCase(locale)}`,
            group: t.commands,
            icon: <Plus size={17} aria-hidden="true" />,
          })),
          ...toolbar.searchEntries.map((entry) => ({
            ...entry,
            icon: entry.taskId ? (
              <CheckSquare size={17} aria-hidden="true" />
            ) : entry.location.kind === "list" ? (
              <List size={17} aria-hidden="true" />
            ) : entry.location.kind === "workspace" ? (
              <Layers size={17} aria-hidden="true" />
            ) : (
              <Folder size={17} aria-hidden="true" />
            ),
          })),
        ]}
        createActions={createActions}
        onCreate={() => toolbar.openCreation()}
        notifications={toolbar.notifications}
        onReadAll={toolbar.readAll}
        onAssistant={toolbar.openAssistant}
        user={{
          name: toolbar.actor?.name ?? t.user,
          initials: toolbar.actor?.initials ?? "П",
          description: toolbar.actor?.specialty,
        }}
        profileActions={[
          {
            id: "account",
            label: t.account.home,
            icon: <CircleUserRound size={17} aria-hidden="true" />,
            onSelect: () => toolbar.openAccount("/account"),
          },
          {
            id: "profile",
            label: t.account.edit,
            icon: <UserRoundPen size={17} aria-hidden="true" />,
            onSelect: () => toolbar.openAccount("/account#name"),
          },
        ]}
        billingActions={[
          {
            id: "balance",
            label: t.account.balance,
            icon: <Wallet size={17} aria-hidden="true" />,
            onSelect: () => toolbar.openBilling("balance"),
          },
          {
            id: "topup",
            label: t.account.topup,
            icon: <CreditCard size={17} aria-hidden="true" />,
            onSelect: () => toolbar.openBilling("topup"),
          },
        ]}
        signOutAction={{
          id: "sign-out",
          label: t.account.signOut,
          icon: <LogOut size={17} aria-hidden="true" />,
          onSelect: () => toolbar.openAccount("/logout"),
        }}
      />
      {toolbar.creationKind && (
        <TaskCreationHub
          kind={toolbar.creationKind}
          onKindChange={toolbar.setCreationKind}
          state={state}
          location={ui.location}
          dispatch={props.dispatch}
          theme={ui.theme}
          locale={locale}
          onClose={() => toolbar.setCreationKind(null)}
          onCreated={(location, taskId) =>
            manager.openTasks(() => {
              ui.navigateLocation(location);
              if (taskId) ui.onOpenTask(taskId);
            })
          }
        />
      )}
      <TaskAccountAvailabilityDialog
        view={toolbar.accountView}
        theme={ui.theme}
        locale={locale}
        onClose={() => toolbar.setAccountView(null)}
      />
    </>
  );
}
