/**
 * @file src/components/admin/task-manager/reference/WorkspaceMembers.component.tsx
 * @version 1.0.0
 * @date 2026-09-18
 * @description Отображает владельца, участников и управляемые назначения доступа к рабочей среде.
 * @see documentation/specifications/task-management.md
 */

import { Bot, Plus, Trash2, UserRound } from "lucide-react";
import { UiButton, UiSelect } from "@realize/ui-kit";
import { useWorkspaceMembers } from "./useWorkspaceMembers.hook";
import { workspaceRoleLabels } from "./taskWorkspace.constants";
import type { WorkspaceMembersProps } from "./WorkspaceViews.types";
import type { WorkspaceMemberRole } from "./taskWorkspace.types";
import styles from "./Workspace.module.css";

export function WorkspaceMembers(props: WorkspaceMembersProps) {
  const { workspace, actors, disabled } = props;
  const members = useWorkspaceMembers(props);
  const entries = [
    { actorId: workspace.ownerId, role: "owner" as const },
    ...workspace.members,
  ];
  return (
    <div className={styles.settingsStack}>
      <div className={styles.sectionIntro}>
        <h2>Участники и доступ</h2>
        <p>
          Люди и агенты используют общие роли доступа. Назначения в конкретных
          задачах задаются отдельно.
        </p>
      </div>
      <div className={styles.accessNote}>
        {workspace.visibility === "private"
          ? "Среда доступна только владельцу и участникам."
          : "Остальные участники команды могут просматривать среду. Редактирование доступно назначенным участникам."}
      </div>
      {!disabled && members.available.length ? (
        <form
          className={styles.addMember}
          onSubmit={(event) => {
            event.preventDefault();
            members.add();
          }}
        >
          <label className={styles.field}>
            <span>Человек или агент</span>
            <UiSelect
              aria-label="Добавить участника"
              value={members.actorId}
              onChange={(event) => members.setActorId(event.target.value)}
              required
            >
              <option value="">Выберите участника</option>
              {members.available.map((actor) => (
                <option key={actor.id} value={actor.id}>
                  {actor.name} ·{" "}
                  {actor.kind === "agent" ? "AI-агент" : "Человек"}
                </option>
              ))}
            </UiSelect>
          </label>
          <label className={styles.field}>
            <span>Роль</span>
            <UiSelect
              aria-label="Роль нового участника"
              value={members.role}
              onChange={(event) =>
                members.setRole(event.target.value as WorkspaceMemberRole)
              }
            >
              {Object.entries(workspaceRoleLabels).map(([value, label]) => (
                <option value={value} key={value}>
                  {label}
                </option>
              ))}
            </UiSelect>
          </label>
          <UiButton type="submit" size="small" disabled={!members.actorId}>
            <Plus size={16} aria-hidden="true" />
            Добавить
          </UiButton>
        </form>
      ) : null}
      {members.message ? (
        <p
          className={members.error ? styles.error : styles.success}
          role={members.error ? "alert" : "status"}
        >
          {members.message}
        </p>
      ) : null}
      <ul className={styles.memberList}>
        {entries.map((entry) => {
          const actor = actors.find((item) => item.id === entry.actorId);
          const Icon = actor?.kind === "agent" ? Bot : UserRound;
          return (
            <li key={entry.actorId} className={styles.memberRow}>
              <span className={styles.memberAvatar}>
                <Icon size={19} aria-hidden="true" />
              </span>
              <div className={styles.memberName}>
                <strong>{actor?.name ?? entry.actorId}</strong>
                <small>
                  {actor?.kind === "agent" ? "AI-агент" : "Человек"}
                </small>
              </div>
              {entry.role === "owner" ? (
                <span className={styles.ownerBadge}>Владелец</span>
              ) : (
                <>
                  <UiSelect
                    aria-label={`Роль: ${actor?.name ?? entry.actorId}`}
                    disabled={disabled}
                    value={entry.role}
                    onChange={(event) =>
                      members.update(
                        entry.actorId,
                        event.target.value as WorkspaceMemberRole,
                      )
                    }
                  >
                    {Object.entries(workspaceRoleLabels).map(
                      ([value, label]) => (
                        <option value={value} key={value}>
                          {label}
                        </option>
                      ),
                    )}
                  </UiSelect>
                  <UiButton
                    variant="ghost"
                    size="icon"
                    disabled={disabled}
                    aria-label={`Удалить участника: ${actor?.name ?? entry.actorId}`}
                    onClick={() => members.update(entry.actorId, null)}
                  >
                    <Trash2 size={16} aria-hidden="true" />
                  </UiButton>
                </>
              )}
            </li>
          );
        })}
      </ul>
      <dl className={styles.roleGuide}>
        <div>
          <dt>Администратор</dt>
          <dd>Настройки, участники, проекты и задачи.</dd>
        </div>
        <div>
          <dt>Участник</dt>
          <dd>Создание проектов и работа с задачами.</dd>
        </div>
        <div>
          <dt>Гость</dt>
          <dd>Просмотр доступных материалов.</dd>
        </div>
      </dl>
    </div>
  );
}
