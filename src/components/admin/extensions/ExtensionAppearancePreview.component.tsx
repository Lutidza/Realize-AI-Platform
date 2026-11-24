/**
 * @file src/components/admin/extensions/ExtensionAppearancePreview.component.tsx
 * @version 1.2.0
 * @date 2026-11-12
 * @description Проверяет candidate layout и общие controls на локальных примерах без сохранения оформления.
 * @see documentation/specifications/extension-management.md
 */
"use client";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import {
  UiBadge,
  UiButton,
  UiInput,
  UiNotice,
  UiSelect,
  UiSurface,
  UiSwitch,
  getUiButtonClassName,
} from "@realize/ui-kit";
import { SystemAdminTemplateHost } from "../system-shell/SystemAdminTemplateHost.component";
import { getSystemAdminNavigation } from "../system-shell/systemAdmin.navigation";
import {
  SYSTEM_APPEARANCE_ROUTE,
  SYSTEM_TASK_MANAGER_ROUTE,
} from "../system-shell/systemAdmin.routes";
import type { ExtensionAppearancePreviewProps } from "./ExtensionAppearancePreview.types";
import { useSystemAdminTemplate } from "../system-shell/useSystemAdminTemplate.hook";
import { EXTENSION_PREVIEW_ONLY_MESSAGE } from "./extensionReadiness.constants";
import styles from "./ExtensionManager.module.css";

/** Локальный mode switch меняет только preview; данные являются явно обозначенными примерами. */
export function ExtensionAppearancePreview({
  assignment,
  expiresAt,
  currentActor,
  readiness,
}: ExtensionAppearancePreviewProps) {
  const [mode, setMode] = useState(assignment.selection.mode);
  const [text, setText] = useState("Пример текста");
  const [variant, setVariant] = useState("first");
  const [enabled, setEnabled] = useState(true);
  const [checked, setChecked] = useState(false);
  const selection = assignment.selection;
  const previewOnly = readiness === "preview-only";
  const { setMode: setTemplateMode } = useSystemAdminTemplate();
  return (
    <SystemAdminTemplateHost
      screen="workspace"
      mode={mode}
      onModeChange={setMode}
      locale="ru"
      context={previewOnly ? undefined : "Предпросмотр оформления"}
      navigation={
        previewOnly
          ? []
          : getSystemAdminNavigation({
              onTasks: () => window.location.assign(SYSTEM_TASK_MANAGER_ROUTE),
            })
      }
      activeNavigationId={previewOnly ? "" : "themes"}
      capabilities={
        previewOnly
          ? undefined
          : {
              account: {
                user: {
                  name: currentActor.name,
                  initials: currentActor.name.slice(0, 2).toUpperCase(),
                },
                profileActions: [],
              },
            }
      }
      pageActions={
        previewOnly
          ? undefined
          : [
              {
                id: "back-to-appearance",
                label: "Вернуться к назначениям",
                icon: <ArrowLeft size={16} aria-hidden="true" />,
                onSelect: () => window.location.assign(SYSTEM_APPEARANCE_ROUTE),
              },
            ]
      }
      footer="Предпросмотр не изменяет активное оформление."
    >
      <div className={[styles.workbench, styles.previewWorkbench].join(" ")}>
        {previewOnly && (
          <>
            <a
              href={SYSTEM_APPEARANCE_ROUTE}
              className={getUiButtonClassName({
                variant: "secondary",
                size: "small",
              })}
            >
              Вернуться к назначениям
            </a>
            <UiNotice role="status">{EXTENSION_PREVIEW_ONLY_MESSAGE}</UiNotice>
            <label className={styles.field}>
              Тема предпросмотра
              <UiSelect
                value={mode}
                onChange={(event) => {
                  const next = event.currentTarget.value;
                  if (next === "light" || next === "dark") {
                    setMode(next);
                    setTemplateMode(next);
                  }
                }}
              >
                <option value="light">Светлая</option>
                <option value="dark">Тёмная</option>
              </UiSelect>
            </label>
          </>
        )}
        <UiNotice
          tone="positive"
          title="Предпросмотр — изменения ещё не применены"
          role="status"
        >
          Здесь показаны только примеры элементов интерфейса. Сохранение
          назначения выполняется отдельно на странице «Темы и шаблоны».{" "}
          Предпросмотр действует до{" "}
          {new Date(expiresAt).toLocaleString("ru-RU")}.
        </UiNotice>
        <header className={styles.header}>
          <div>
            <h1 className={styles.heading}>Предпросмотр оформления</h1>
            <p className={styles.intro}>
              {selection.templateId} {selection.templateVersion} ·{" "}
              {selection.paletteId} {selection.paletteVersion}
            </p>
          </div>
          <UiBadge>{mode === "light" ? "Светлый" : "Тёмный"}</UiBadge>
        </header>
        <UiSurface className={styles.surface}>
          <div className={styles.sectionHeader}>
            <h2>Примеры формы и кнопок</h2>
          </div>
          <form
            className={styles.stack}
            onSubmit={(event) => {
              event.preventDefault();
              setChecked(true);
            }}
          >
            <div className={styles.formGrid}>
              <label className={styles.field}>
                Текст примера
                <UiInput
                  value={text}
                  onChange={(event) => setText(event.currentTarget.value)}
                />
              </label>
              <label className={styles.field}>
                Вариант примера
                <UiSelect
                  value={variant}
                  onChange={(event) => setVariant(event.currentTarget.value)}
                >
                  <option value="first">Первый вариант</option>
                  <option value="second">Второй вариант</option>
                </UiSelect>
              </label>
            </div>
            <label className={styles.switchField}>
              <span>Переключатель примера</span>
              <UiSwitch
                checked={enabled}
                onChange={(event) => setEnabled(event.currentTarget.checked)}
              />
            </label>
            <div className={styles.actions}>
              <UiButton type="submit">Проверить форму</UiButton>
              <UiButton
                variant="secondary"
                type="button"
                onClick={() => {
                  setText("Пример текста");
                  setChecked(false);
                }}
              >
                Сбросить пример
              </UiButton>
              <UiButton type="button" disabled>
                Недоступная кнопка
              </UiButton>
            </div>
            {checked && (
              <UiNotice tone="positive" role="status">
                Локальная форма работает. Данные на сервер не отправлялись.
              </UiNotice>
            )}
          </form>
        </UiSurface>
        <UiSurface className={styles.surface}>
          <div className={styles.sectionHeader}>
            <h2>Пример таблицы состояний</h2>
          </div>
          <table className={styles.previewTable}>
            <thead>
              <tr>
                <th scope="col">Элемент примера</th>
                <th scope="col">Состояние</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Поле текста</td>
                <td>{text ? "Заполнено" : "Пустое"}</td>
              </tr>
              <tr>
                <td>Список выбора</td>
                <td>
                  {variant === "first" ? "Первый вариант" : "Второй вариант"}
                </td>
              </tr>
              <tr>
                <td>Переключатель</td>
                <td>{enabled ? "Включён" : "Выключен"}</td>
              </tr>
            </tbody>
          </table>
        </UiSurface>
      </div>
    </SystemAdminTemplateHost>
  );
}
