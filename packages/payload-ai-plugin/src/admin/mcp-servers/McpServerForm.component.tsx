/**
 * @file packages/payload-ai-plugin/src/admin/mcp-servers/McpServerForm.component.tsx
 * @version 1.0.0
 * @date 2026-09-23
 * @description Сохраняет пользовательский черновик при ошибках и конфликте версий MCP.
 */
"use client";
import { useEffect, useState } from "react";
import {
  UiButton,
  UiInput,
  UiNotice,
  UiSelect,
  UiSurface,
} from "@realize/ui-kit";
import type { McpFormProps } from "./McpServersClient.types";
import { McpHostedFields } from "./McpHostedFields.component";
import styles from "./McpServers.module.css";

/** Новые server DTO не сбрасывают черновик; сброс выполняется явным действием родителя. */
export function McpServerForm({
  initial,
  profiles,
  busy,
  existing,
  onSave,
  onDirtyChange,
}: McpFormProps) {
  const [draft, setDraft] = useState(initial);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(() => {
    if (!dirty) return;
    const guard = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);
  const config = draft.configuration;
  return (
    <UiSurface asChild>
      <form
        className={styles.section}
        onSubmit={(event) => {
          event.preventDefault();
          void onSave(draft);
        }}
      >
        <h2>{existing ? "Настройки сервера" : "Добавить сервер"}</h2>
        {dirty && (
          <UiNotice role="status">Есть несохранённые изменения.</UiNotice>
        )}
        <fieldset disabled={busy} className={styles.stack}>
          <div className={styles.grid}>
            <label className={styles.field}>
              Название
              <UiInput
                required
                autoComplete="off"
                maxLength={120}
                value={draft.displayName}
                onChange={(event) =>
                  setDraft({ ...draft, displayName: event.target.value })
                }
              />
            </label>
            <label className={styles.field}>
              Окружение
              <UiInput
                required
                maxLength={120}
                value={config.environment}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    configuration: {
                      ...config,
                      environment: event.target.value,
                    },
                  })
                }
              />
            </label>
          </div>
          {config.serverType === "realize-internal" ? (
            <McpHostedFields
              value={config}
              profiles={profiles}
              onChange={(configuration) =>
                setDraft({ ...draft, configuration })
              }
            />
          ) : config.serverType !== "mcp-http" ? (
            <>
              <UiNotice>
                Запись описывает внешнее подключение. Запуск, ключи и проверки
                управляются его владельцем.
              </UiNotice>
              <label className={styles.field}>
                Профиль внешнего подключения
                <UiInput
                  required
                  pattern="[A-Za-z0-9_-]{1,80}"
                  value={config.profileReference}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      configuration: {
                        ...config,
                        profileReference: event.target.value,
                      },
                    })
                  }
                />
              </label>
              <label className={styles.field}>
                Владелец настроек
                <UiSelect
                  value={config.managementSource}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      configuration: {
                        ...config,
                        managementSource: event.target.value as
                          "operator_managed" | "client_managed",
                      },
                    })
                  }
                >
                  <option value="client_managed">Внешний клиент</option>
                  <option value="operator_managed">Оператор</option>
                </UiSelect>
              </label>
            </>
          ) : (
            <UiNotice>Adapter ещё не подключён.</UiNotice>
          )}
          <div className={styles.row}>
            <UiButton
              disabled={
                busy ||
                (existing && !dirty) ||
                (config.serverType === "realize-internal" && !profiles.length)
              }
              type="submit"
            >
              {busy
                ? "Сохранение…"
                : existing
                  ? "Сохранить настройки"
                  : "Создать отключённый сервер"}
            </UiButton>
          </div>
        </fieldset>
      </form>
    </UiSurface>
  );
}
