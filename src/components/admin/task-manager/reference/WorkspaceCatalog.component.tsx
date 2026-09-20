/**
 * @file src/components/admin/task-manager/reference/WorkspaceCatalog.component.tsx
 * @version 1.0.1
 * @date 2026-09-18
 * @description Показывает доступные рабочие среды и входы в их содержимое и настройки.
 * @see documentation/specifications/task-management.md
 */

import { Archive, ArrowUpRight, Plus, Settings2, Users } from "lucide-react";
import { UiButton, UiSearchInput, UiSelect, UiTabs } from "@realize/ui-kit";
import { prototypeActors } from "./taskManager.fixtures";
import { workspaceIcons } from "./taskWorkspace.constants";
import { useWorkspaceCatalog } from "./useWorkspaceCatalog.hook";
import type { WorkspaceCatalogProps } from "./WorkspaceViews.types";
import styles from "./Workspace.module.css";

export function WorkspaceCatalog({
  state,
  onCreate,
  onOpen,
  onSettings,
}: WorkspaceCatalogProps) {
  const catalog = useWorkspaceCatalog(state);
  const content = (
    <div className={styles.settingsStack}>
      <div className={styles.catalogToolbar}>
        <UiSearchInput
          className={styles.search}
          aria-label="Найти рабочую среду"
          placeholder="Найти среду по названию или описанию"
          value={catalog.query}
          onChange={(event) => catalog.setQuery(event.target.value)}
        />
        <UiSelect
          aria-label="Сортировка сред"
          value={catalog.sort}
          onChange={(event) => catalog.setSort(event.target.value)}
        >
          <option value="updated">По обновлению</option>
          <option value="name">По названию</option>
        </UiSelect>
      </div>
      <div className={styles.catalog} role="table" aria-label="Рабочие среды">
        <div className={styles.catalogHeader} role="row">
          <span role="columnheader">Среда</span>
          <span role="columnheader">Участники</span>
          <span role="columnheader">Проекты / задачи</span>
          <span role="columnheader">Запуски</span>
          <span role="columnheader">Действия</span>
        </div>
        {catalog.rows.map(({ workspace, summary, access }) => {
          const Icon = workspaceIcons[workspace.icon];
          return (
            <div className={styles.catalogRow} role="row" key={workspace.id}>
              <div className={styles.identity} role="cell">
                <span
                  className={styles.workspaceAvatar}
                  data-color={workspace.color}
                >
                  <Icon size={22} aria-hidden="true" />
                </span>
                <div>
                  <UiButton
                    variant="ghost"
                    className={styles.nameButton}
                    onClick={() => onOpen(workspace.id)}
                  >
                    {workspace.name}
                  </UiButton>
                  <p>{workspace.description || "Описание не добавлено"}</p>
                  <small>
                    Владелец:{" "}
                    {prototypeActors.find(
                      (actor) => actor.id === workspace.ownerId,
                    )?.name ?? workspace.ownerId}
                  </small>
                  <small>
                    Обновлено:{" "}
                    <time dateTime={workspace.updatedAt}>
                      {new Intl.DateTimeFormat("ru-RU", {
                        day: "numeric",
                        month: "short",
                        timeZone: workspace.timezone,
                      }).format(new Date(workspace.updatedAt))}
                    </time>
                  </small>
                </div>
              </div>
              <div className={styles.metric} role="cell">
                <Users size={15} aria-hidden="true" />
                <span>Участники: {summary.members}</span>
              </div>
              <div className={styles.metric} role="cell">
                <strong>Проекты: {summary.projects}</strong>
                <small>Активные задачи: {summary.tasks}</small>
              </div>
              <div className={styles.metric} role="cell">
                <strong>Выполняется: {summary.running}</strong>
                <small>Ожидают: {summary.waiting}</small>
              </div>
              <div className={styles.rowActions} role="cell">
                <UiButton
                  variant="secondary"
                  size="small"
                  onClick={() => onOpen(workspace.id)}
                >
                  Открыть
                  <ArrowUpRight size={14} aria-hidden="true" />
                </UiButton>
                {access.canManage ? (
                  <UiButton
                    variant="ghost"
                    size="icon"
                    aria-label={`Настройки: ${workspace.name}`}
                    title="Настройки среды"
                    onClick={() =>
                      onSettings(
                        workspace.id,
                        workspace.archived ? "manage" : "general",
                      )
                    }
                  >
                    <Settings2 size={17} aria-hidden="true" />
                  </UiButton>
                ) : null}
              </div>
            </div>
          );
        })}
        {!catalog.rows.length ? (
          <div className={styles.empty}>
            <Archive size={28} aria-hidden="true" />
            <h2>
              {catalog.query
                ? "Ничего не найдено"
                : catalog.archived
                  ? "Архив пока пуст"
                  : "Создайте первую рабочую среду"}
            </h2>
            <p>
              {catalog.query
                ? "Попробуйте другое название или очистите поиск."
                : catalog.archived
                  ? "Архивные среды сохраняют проекты и историю работы."
                  : "Объедините проекты и участников в одном месте."}
            </p>
            {!catalog.archived && !catalog.query ? (
              <UiButton size="small" onClick={onCreate}>
                Создать среду
              </UiButton>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <span className={styles.eyebrow}>ОРГАНИЗАЦИЯ РАБОТЫ</span>
          <h1>Рабочие среды</h1>
          <p>Команды, проекты и общий контекст работы людей и агентов.</p>
        </div>
        <UiButton onClick={onCreate}>
          <Plus size={17} aria-hidden="true" />
          Создать среду
        </UiButton>
      </header>
      <UiTabs
        appearance="underline"
        label="Состояние рабочих сред"
        value={catalog.archived ? "archive" : "active"}
        onValueChange={(value) => catalog.setArchived(value === "archive")}
        items={[
          {
            id: "active",
            content: !catalog.archived ? content : null,
            label: `Активные · ${catalog.activeCount}`,
          },
          {
            id: "archive",
            content: catalog.archived ? content : null,
            label: `Архив · ${catalog.archiveCount}`,
          },
        ]}
      />
    </div>
  );
}
