/**
 * @file packages/payload-ai-plugin/src/admin/integrations/codex/CodexAgentSettings.view.tsx
 * @version 1.1.0
 * @date 2026-09-30
 * @description Показывает единый переключатель, модели и доступные операции админского агента.
 */

import {
  UiButton,
  UiInput,
  UiNotice,
  UiSurface,
  UiSwitch,
} from "@realize/ui-kit";
import { Bot, Check, Clock3, Save, ShieldCheck } from "lucide-react";
import { IntegrationFormSection } from "../IntegrationFormSection.component";
import type { CodexAgentSettingsViewProps } from "./CodexAgentSettings.types";
import { CodexRepositorySearchSettingsView } from "./CodexRepositorySearchSettings.view";
import { CodexModelSelect } from "./CodexModelSelect.component";
import styles from "./CodexChatSettings.module.css";
import fields from "../IntegrationConnectionForm.module.css";

export const CodexAgentSettingsView = ({
  form,
}: CodexAgentSettingsViewProps) => (
  <div className={styles.settings}>
    {form.isBlocked ? (
      <UiNotice tone="neutral">
        Сохраните изменения на другой вкладке или дождитесь завершения текущего
        действия, чтобы изменить настройки агента.
      </UiNotice>
    ) : null}
    <IntegrationFormSection
      title="Админский агент"
      description="Управляйте работой агента через сохранённое подключение GPT — Codex. Изменения действуют после сохранения."
      icon={<Bot size={20} />}
    >
      <UiSurface asChild tone="raised">
        <label className={fields.toggleField}>
          <span className={fields.toggleCopy}>
            <strong>Админский агент включён</strong>
            <small>
              Разрешить новые сообщения, процессы и операции. История, отмена и
              откат доступны и после выключения.
            </small>
          </span>
          <UiSwitch
            checked={form.enabled}
            disabled={form.isDisabled}
            onChange={(event) => form.setEnabled(event.target.checked)}
          />
        </label>
      </UiSurface>
      <label className={fields.field}>
        <span>Модель агента</span>
        <CodexModelSelect
          value={form.settings.model}
          models={form.modelCatalog?.models}
          disabled={form.isDisabled}
          emptyLabel="По умолчанию в GPT — Codex"
          onChange={(model) => form.update({ model: model })}
        />
        <small>
          Идентификатор модели, доступной подключённому аккаунту. Пустое поле
          использует выбор провайдера; уже начатые запуски сохраняют свою
          модель.
        </small>
      </label>
      <UiButton
        disabled={form.isDisabled}
        onClick={() => void form.loadModels()}
      >
        {form.modelsLoading
          ? "Получение каталога…"
          : "Обновить каталог моделей"}
      </UiButton>
      {form.modelsError ? (
        <UiNotice tone="danger">{form.modelsError}</UiNotice>
      ) : null}
      {form.modelCatalog ? (
        <small>
          Каталог подключённого Codex получен{" "}
          {new Date(form.modelCatalog.fetchedAt).toLocaleString("ru-RU")}.
          Доступ подтверждается выполненным запросом.
        </small>
      ) : null}
    </IntegrationFormSection>
    <CodexRepositorySearchSettingsView form={form} />
    <IntegrationFormSection
      title="Выполнение и публикация"
      description="Управляйте этапами работы с кодом. Каждый этап сохраняет проверки прав и подтверждение изменений."
      icon={<ShieldCheck size={20} />}
    >
      <div className={styles.options}>
        {(
          [
            {
              key: "execution",
              title: "Выполнение изменений кода",
              description: "Запуск согласованного плана в рабочем окружении",
            },
            {
              key: "preview",
              title: "Предварительный просмотр",
              description: "Подготовка временной версии для проверки изменений",
            },
            {
              key: "release",
              title: "Подготовка выпуска",
              description: "Сборка и проверка кандидата выпуска",
            },
            {
              key: "sourcePromotion",
              title: "Публикация Pull Request",
              description:
                "Передача подтверждённых изменений в подключённый репозиторий",
            },
          ] as const
        ).map((option) => (
          <label className={styles.option} key={option.key}>
            <span className={styles.optionText}>
              <strong>{option.title}</strong>
              <small>{option.description}</small>
            </span>
            <UiSwitch
              checked={form.settings[option.key].enabled}
              disabled={form.isDisabled}
              onChange={(event) =>
                form.update({
                  [option.key]: {
                    ...form.settings[option.key],
                    enabled: event.target.checked,
                  },
                })
              }
            />
          </label>
        ))}
      </div>
      <p className={styles.hint}>
        Общая доступность изменений кода и операций с CMS задаётся на вкладке
        «Инструменты». Для выполнения также нужны соответствующие права и
        готовое рабочее окружение.
      </p>
    </IntegrationFormSection>
    <IntegrationFormSection
      title="Дополнительные параметры"
      description="Модель проверки и сроки действия подготовленных результатов."
      icon={<Clock3 size={20} />}
    >
      <details>
        <summary>Настроить модель проверки и сроки</summary>
        <div className={fields.formGrid}>
          <label className={fields.field}>
            <span>Модель проверяющего</span>
            <CodexModelSelect
              value={form.settings.reviewModel}
              models={form.modelCatalog?.models}
              disabled={form.isDisabled}
              emptyLabel="Использовать модель агента"
              onChange={(model) => form.update({ reviewModel: model })}
            />
            <small>Пустое поле использует основную модель агента.</small>
          </label>
          {(
            [
              {
                group: "execution",
                key: "capabilityTTLSeconds",
                title: "Срок разрешения на выполнение",
                hint: "Минимум 60 секунд",
                min: 60,
              },
              {
                group: "execution",
                key: "artifactsTTLSeconds",
                title: "Хранение результатов выполнения",
                hint: "Минимум 3 600 секунд (1 час)",
                min: 3600,
              },
              {
                group: "preview",
                key: "ttlSeconds",
                title: "Срок предварительного просмотра",
                hint: "Минимум 900 секунд (15 минут)",
                min: 900,
              },
              {
                group: "release",
                key: "ttlSeconds",
                title: "Срок кандидата выпуска",
                hint: "Минимум 3 600 секунд (1 час)",
                min: 3600,
              },
            ] as const
          ).map((field) => (
            <label className={fields.field} key={`${field.group}-${field.key}`}>
              <span>{field.title}, секунды</span>
              <UiInput
                type="number"
                min={field.min}
                max={604800}
                step={1}
                value={
                  field.group === "execution"
                    ? form.settings.execution[field.key]
                    : form.settings[field.group].ttlSeconds
                }
                disabled={form.isDisabled}
                onChange={(event) =>
                  form.update({
                    [field.group]: {
                      ...form.settings[field.group],
                      [field.key]: Number(event.target.value),
                    },
                  })
                }
              />
              <small>{field.hint}. Максимум 604 800 секунд (7 дней).</small>
            </label>
          ))}
        </div>
      </details>
    </IntegrationFormSection>
    {form.isConflicted ? (
      <UiNotice tone="neutral" title="Настройки изменились">
        Черновик сохранён в форме. Сбросьте его, чтобы загрузить актуальные
        значения перед новым сохранением.
      </UiNotice>
    ) : null}
    {form.error ? (
      <UiNotice tone="danger" role="alert" title="Настройки не сохранены">
        {form.error}
      </UiNotice>
    ) : null}
    {form.hasRetry ? (
      <UiNotice tone="neutral" title="Результат сохранения не подтверждён">
        Повторите запрос: сервер проверит результат той же операции. До
        подтверждения черновик защищён от изменения и перехода на другую
        страницу.
      </UiNotice>
    ) : null}
    {form.hasSaved ? (
      <UiNotice
        tone="positive"
        icon={<Check size={18} />}
        role="status"
        title="Настройки агента сохранены"
      >
        Изменения применены. Доступность чата обновляется автоматически.
      </UiNotice>
    ) : null}
    <div className={styles.actions}>
      <UiButton
        disabled={
          form.isSaving ||
          (!form.hasRetry &&
            (form.isDisabled || !form.isDirty || form.isConflicted))
        }
        onClick={() => void form.save()}
      >
        <Save size={16} />
        {form.isSaving
          ? "Сохранение…"
          : form.hasRetry
            ? "Повторить сохранение"
            : "Сохранить настройки агента"}
      </UiButton>
      {form.isDirty && !form.hasRetry ? (
        <UiButton
          disabled={form.isDisabled}
          variant="ghost"
          onClick={form.reset}
        >
          Сбросить
        </UiButton>
      ) : null}
    </div>
    {form.isDirty && !form.hasRetry ? (
      <p className={styles.hint}>
        Есть несохранённые изменения. Сохраните или сбросьте их перед выходом из
        настроек.
      </p>
    ) : null}
  </div>
);
