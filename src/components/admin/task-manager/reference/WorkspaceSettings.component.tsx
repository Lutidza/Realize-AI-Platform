/**
 * @file src/components/admin/task-manager/reference/WorkspaceSettings.component.tsx
 * @version 1.0.1
 * @date 2026-09-18
 * @description Собирает общие настройки, доступ участников и управление архивом среды.
 * @see documentation/specifications/task-management.md
 */

import {
  Archive,
  ArchiveRestore,
  ArrowUpRight,
  Settings2,
  Users,
} from "lucide-react";
import { UiButton, UiTabs } from "@realize/ui-kit";
import { WorkspaceGeneralFields } from "./WorkspaceGeneralFields.component";
import { WorkspaceMembers } from "./WorkspaceMembers.component";
import {
  getWorkspaceAccess,
  getWorkspaceSummary,
} from "./taskWorkspace.access";
import { workspaceIcons } from "./taskWorkspace.constants";
import type { WorkspaceSettingsProps } from "./WorkspaceViews.types";
import type { WorkspaceTab } from "./taskWorkspace.types";
import styles from "./Workspace.module.css";

export function WorkspaceSettings({
  state,
  actors,
  manager,
  dispatch,
  onQueue,
}: WorkspaceSettingsProps) {
  const { workspace, composer } = manager;
  const access = getWorkspaceAccess(state, workspace);
  if (!workspace || !access.canRead)
    return (
      <div className={styles.empty}>
        <h1>Среда недоступна</h1>
        <UiButton onClick={manager.openCatalog}>Все рабочие среды</UiButton>
      </div>
    );
  const Icon = workspaceIcons[workspace.icon];
  const summary = getWorkspaceSummary(state, workspace);
  const disabled = !access.canManage || workspace.archived;
  const content = (
    <div className={styles.settingsStack}>
      {manager.notice ? (
        <p
          className={state.lastResult.ok ? styles.success : styles.error}
          role={state.lastResult.ok ? "status" : "alert"}
        >
          {manager.notice}
        </p>
      ) : null}
      {workspace.archived ? (
        <p className={styles.accessNote}>
          Среда в архиве. Проекты и задачи сохранены; настройки доступны для
          просмотра.
        </p>
      ) : !access.canManage ? (
        <p className={styles.accessNote}>
          У вас есть доступ к просмотру. Настройки изменяют владелец и
          администраторы.
        </p>
      ) : null}
      {manager.tab === "general" ? (
        <form
          className={styles.settingsCard}
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            composer.save();
          }}
        >
          <div className={styles.sectionIntro}>
            <h2>Общие настройки</h2>
            <p>Название, оформление и календарь команды.</p>
          </div>
          <WorkspaceGeneralFields composer={composer} disabled={disabled} />
          {!disabled ? (
            <div className={styles.saveBar}>
              <span>
                {composer.dirty
                  ? "Есть несохранённые изменения"
                  : "Все изменения сохранены"}
              </span>
              <div className={styles.formActions}>
                <UiButton
                  variant="ghost"
                  size="small"
                  disabled={!composer.dirty}
                  onClick={manager.reload}
                >
                  Отменить изменения
                </UiButton>
                <UiButton type="submit" size="small" disabled={!composer.dirty}>
                  Сохранить
                </UiButton>
              </div>
            </div>
          ) : null}
        </form>
      ) : null}
      {manager.tab === "members" ? (
        <div className={styles.settingsCard}>
          <WorkspaceMembers
            key={workspace.id}
            workspace={workspace}
            state={state}
            actors={actors}
            dispatch={dispatch}
            disabled={disabled}
          />
        </div>
      ) : null}
      {manager.tab === "manage" ? (
        <div className={styles.settingsCard}>
          <div className={styles.sectionIntro}>
            <h2>
              {workspace.archived ? "Восстановить среду" : "Архивирование"}
            </h2>
            <p>
              {workspace.archived
                ? "Верните среду в активный список. Задачи и участники сохранятся, запуски не начнутся автоматически."
                : "Уберите завершённую среду из активной навигации, сохранив её содержимое."}
            </p>
          </div>
          <div className={styles.archiveSummary}>
            <span>Проекты: {summary.projects}</span>
            <span>Активные задачи: {summary.tasks}</span>
            <span>Участники: {summary.members}</span>
          </div>
          {summary.running + summary.waiting > 0 ? (
            <div className={styles.accessNote}>
              Незавершённых запусков: {summary.running + summary.waiting}. Перед
              архивированием завершите или отмените их.
              <UiButton variant="ghost" size="small" onClick={onQueue}>
                Открыть очередь
                <ArrowUpRight size={14} aria-hidden="true" />
              </UiButton>
            </div>
          ) : null}
          {access.canManage ? (
            <UiButton
              variant="secondary"
              size="small"
              onClick={() =>
                workspace.archived
                  ? manager.archive(false)
                  : manager.setArchiveOpen(true)
              }
            >
              {workspace.archived ? (
                <ArchiveRestore size={16} aria-hidden="true" />
              ) : (
                <Archive size={16} aria-hidden="true" />
              )}
              {workspace.archived ? "Восстановить среду" : "Архивировать среду"}
            </UiButton>
          ) : null}
        </div>
      ) : null}
    </div>
  );
  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div className={styles.settingsIdentity}>
          <span className={styles.workspaceAvatar} data-color={workspace.color}>
            <Icon size={26} aria-hidden="true" />
          </span>
          <div>
            <span className={styles.eyebrow}>
              {workspace.archived ? "АРХИВНАЯ СРЕДА" : "НАСТРОЙКИ СРЕДЫ"}
            </span>
            <h1>{workspace.name}</h1>
            <p>
              Владелец:{" "}
              {actors.find((actor) => actor.id === workspace.ownerId)?.name ??
                workspace.ownerId}
            </p>
          </div>
        </div>
      </header>
      <UiTabs
        appearance="underline"
        label="Настройки рабочей среды"
        value={manager.tab}
        onValueChange={(value) => manager.changeTab(value as WorkspaceTab)}
        items={[
          {
            id: "general",
            content: manager.tab === "general" ? content : null,
            label: "Общие",
            icon: <Settings2 size={16} />,
          },
          {
            id: "members",
            content: manager.tab === "members" ? content : null,
            label: `Участники и доступ · ${summary.members}`,
            icon: <Users size={16} />,
          },
          {
            id: "manage",
            content: manager.tab === "manage" ? content : null,
            label: "Управление",
            icon: <Archive size={16} />,
          },
        ]}
      />
    </div>
  );
}
