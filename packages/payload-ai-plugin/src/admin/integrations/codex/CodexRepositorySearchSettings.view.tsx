/**
 * @file packages/payload-ai-plugin/src/admin/integrations/codex/CodexRepositorySearchSettings.view.tsx
 * @version 1.0.0
 * @date 2026-09-30
 * @description Показывает настройки поиска проекта с существующими полями и переключателями Admin.
 * @see documentation/architecture/codex-integration.md
 */
import { UiSelect, UiSwitch } from "@realize/ui-kit";
import { Bot } from "lucide-react";
import { IntegrationFormSection } from "../IntegrationFormSection.component";
import { CodexModelSelect } from "./CodexModelSelect.component";
import type { CodexAgentSettingsViewProps } from "./CodexAgentSettings.types";
import styles from "./CodexChatSettings.module.css";
import fields from "../IntegrationConnectionForm.module.css";

export const CodexRepositorySearchSettingsView = ({
  form,
}: CodexAgentSettingsViewProps) => (
  <IntegrationFormSection
    title="Поиск в проекте"
    description="Поиск читает текущие файлы локального или серверного проекта. Настройки применяются к новым сообщениям, исполнителю и проверяющему."
    icon={<Bot size={20} />}
  >
    <label className={styles.option}>
      <span className={styles.optionText}>
        <strong>Поиск файлов включён</strong>
        <small>
          Ограниченный поиск и чтение источников с ссылками на строки
        </small>
      </span>
      <UiSwitch
        checked={form.settings.search.enabled}
        disabled={form.isDisabled}
        onChange={(event) =>
          form.update({
            search: {
              ...form.settings.search,
              enabled: event.target.checked,
            },
          })
        }
      />
    </label>
    <label className={fields.field}>
      <span>Режим поиска</span>
      <UiSelect
        value={form.settings.search.mode}
        disabled={form.isDisabled || !form.settings.search.enabled}
        onChange={(event) =>
          form.update({
            search: {
              ...form.settings.search,
              mode: event.target.value as "direct" | "subagent",
            },
          })
        }
      >
        <option value="direct">Прямой — основной агент</option>
        <option value="subagent">Отдельный поисковый субагент</option>
      </UiSelect>
      <small>
        Запросы выполняются последовательно. В режиме субагента одновременно
        работает один поисковый помощник.
      </small>
    </label>
    {form.settings.search.mode === "subagent" ? (
      <label className={fields.field}>
        <span>Модель поискового субагента</span>
        <CodexModelSelect
          models={form.searchModels}
          value={form.settings.search.model}
          disabled={form.isDisabled || !form.settings.search.enabled}
          emptyLabel="Выберите модель из каталога"
          onChange={(model) =>
            form.update({ search: { ...form.settings.search, model } })
          }
        />
        <small>
          {form.modelCatalog?.models.find(
            (model) => model.model === form.settings.search.model,
          )?.description ??
            "Загрузите каталог и выберите более экономичную модель для ограниченного поиска. Каталог не передаёт числовые тарифы."}
        </small>
      </label>
    ) : null}
    <label className={styles.option}>
      <span className={styles.optionText}>
        <strong>Искать в инструкциях проекта</strong>
        <small>
          Чтение .ai и .codex доступно только пользователям с правом управления
          конфигурацией ИИ
        </small>
      </span>
      <UiSwitch
        checked={form.settings.search.developerInstructions}
        disabled={form.isDisabled || !form.settings.search.enabled}
        onChange={(event) =>
          form.update({
            search: {
              ...form.settings.search,
              developerInstructions: event.target.checked,
            },
          })
        }
      />
    </label>
  </IntegrationFormSection>
);
