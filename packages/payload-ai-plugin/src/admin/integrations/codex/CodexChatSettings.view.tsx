/**
 * @file packages/payload-ai-plugin/src/admin/integrations/codex/CodexChatSettings.view.tsx
 * @version 1.0.0
 * @date 2026-09-09
 * @description Отображает настройки размещения, поведения и инструментов чата.
 */

import { UiButton, UiNotice, UiSurface, UiSwitch } from "@realize/ui-kit";
import {
  AppWindow,
  Check,
  Code2,
  Database,
  LayoutTemplate,
  MessageSquare,
  PanelRight,
  Save,
  Settings2,
  ShieldCheck,
} from "lucide-react";
import { IntegrationFormSection } from "../IntegrationFormSection.component";
import type { CodexChatSettingsViewProps } from "./CodexChatSettings.types";
import styles from "./CodexChatSettings.module.css";

export const CodexChatSettingsView = ({
  form,
  section,
}: CodexChatSettingsViewProps) => (
  <div className={styles.settings}>
    {section === "chat" ? (
      <>
        <IntegrationFormSection
          title="Где открывать чат"
          description="Выберите удобное расположение. Его можно сменить и во время диалога."
          icon={<MessageSquare size={20} />}
        >
          <fieldset className={styles.modeGroup} disabled={form.isDisabled}>
            <legend className={styles.legend}>Режим размещения</legend>
            <div className={styles.modes}>
              {(
                [
                  {
                    id: "panel",
                    title: "Правая панель",
                    description: "Чат рядом с текущей страницей",
                    icon: <PanelRight size={18} />,
                  },
                  {
                    id: "window",
                    title: "Отдельное окно",
                    description: "Самостоятельное окно браузера",
                    icon: <AppWindow size={18} />,
                  },
                  {
                    id: "page",
                    title: "Контентная область",
                    description: "Полноценное рабочее пространство",
                    icon: <LayoutTemplate size={18} />,
                  },
                ] as const
              ).map((mode) => (
                <UiSurface
                  asChild
                  interactive
                  key={mode.id}
                  tone={
                    form.settings.displayMode === mode.id ? "accent" : "default"
                  }
                >
                  <label className={styles.mode}>
                    <span
                      aria-hidden="true"
                      className={styles.preview}
                      data-mode={mode.id}
                    >
                      <span className={styles.previewNav} />
                      <span className={styles.previewContent}>
                        <i />
                        <i />
                        <i />
                      </span>
                      <span className={styles.previewChat}>
                        <MessageSquare size={20} />
                        <i />
                      </span>
                    </span>
                    <span className={styles.modeTitle}>
                      {mode.icon}
                      <strong>{mode.title}</strong>
                      <input
                        checked={form.settings.displayMode === mode.id}
                        name={form.groupName}
                        onChange={() => form.update({ displayMode: mode.id })}
                        type="radio"
                        value={mode.id}
                      />
                    </span>
                    <small>{mode.description}</small>
                  </label>
                </UiSurface>
              ))}
            </div>
          </fieldset>
        </IntegrationFormSection>
        <IntegrationFormSection
          title="Поведение диалога"
          description="Настройки применяются к чату во всех режимах."
          icon={<Settings2 size={20} />}
        >
          <div className={styles.options}>
            {(
              [
                {
                  key: "showHistory",
                  title: "История диалогов",
                  description: "Показывать список диалогов при открытии чата",
                },
                {
                  key: "showActivity",
                  title: "Действия ассистента",
                  description: "Показывать подробности текущей задачи",
                },
                {
                  key: "sendOnEnter",
                  title: "Отправка по Enter",
                  description:
                    "Shift+Enter добавляет строку. Если выключено, используйте кнопку отправки",
                },
              ] as const
            ).map((option) => (
              <label className={styles.option} key={option.key}>
                <span className={styles.optionText}>
                  <strong>{option.title}</strong>
                  <small>{option.description}</small>
                </span>
                <UiSwitch
                  checked={form.settings[option.key]}
                  disabled={form.isDisabled}
                  onChange={(event) =>
                    form.update({ [option.key]: event.target.checked })
                  }
                />
              </label>
            ))}
          </div>
        </IntegrationFormSection>
      </>
    ) : (
      <IntegrationFormSection
        title="Инструменты ассистента"
        description="Управляйте доступными операциями. Ограничения проверяются сервером."
        icon={<ShieldCheck size={20} />}
      >
        <div className={styles.options}>
          {(
            [
              {
                key: "codeChanges",
                title: "Изменения кода",
                description:
                  "Подготовка плана, выполнение и продвижение согласованных изменений",
                icon: <Code2 size={20} />,
              },
              {
                key: "dataOperations",
                title: "Операции с данными CMS",
                description:
                  "Подготовка и применение поддерживаемых изменений каталога",
                icon: <Database size={20} />,
              },
            ] as const
          ).map((tool) => (
            <label className={styles.option} key={tool.key}>
              <UiSurface asChild tone="raised">
                <span aria-hidden="true" className={styles.toolIcon}>
                  {tool.icon}
                </span>
              </UiSurface>
              <span className={styles.optionText}>
                <strong>{tool.title}</strong>
                <small>{tool.description}</small>
              </span>
              <UiSwitch
                checked={form.settings.tools[tool.key]}
                disabled={form.isDisabled}
                onChange={(event) =>
                  form.update({
                    tools: {
                      ...form.settings.tools,
                      [tool.key]: event.target.checked,
                    },
                  })
                }
              />
            </label>
          ))}
        </div>
        <p className={styles.hint}>
          Включённый инструмент сохраняет проверку прав и подтверждение
          изменений. Чтение диалогов, отмена и откат остаются доступны.
        </p>
      </IntegrationFormSection>
    )}
    {form.error ? (
      <UiNotice tone="danger" role="alert" title="Настройки не сохранены">
        {form.error}
      </UiNotice>
    ) : null}
    {form.hasSaved ? (
      <UiNotice
        tone="positive"
        icon={<Check size={18} />}
        role="status"
        title="Настройки чата сохранены"
      >
        Изменения применены.
      </UiNotice>
    ) : null}
    <div className={styles.actions}>
      <UiButton
        disabled={form.isDisabled || !form.isDirty}
        onClick={() => void form.save()}
      >
        <Save size={16} />
        {form.isSaving ? "Сохранение…" : "Сохранить настройки"}
      </UiButton>
      {form.isDirty ? (
        <UiButton
          disabled={form.isDisabled}
          onClick={form.reset}
          variant="ghost"
        >
          Сбросить
        </UiButton>
      ) : null}
      <UiButton
        className={styles.open}
        disabled={form.isDisabled}
        onClick={form.openChat}
        variant="secondary"
      >
        <MessageSquare size={16} />
        Открыть чат
      </UiButton>
    </div>
  </div>
);
