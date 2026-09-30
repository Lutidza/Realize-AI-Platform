/**
 * @file packages/payload-ai-plugin/src/admin/mcp-servers/McpGrantFields.component.tsx
 * @version 1.1.0
 * @date 2026-09-26
 * @description Показывает одинаковый выбор прав для ручного клиента и подключения ChatGPT.
 */
import { UiSwitch } from "@realize/ui-kit";
import type { McpGrantFieldsProps } from "./McpServersClient.types";
import styles from "./McpServers.module.css";

export function McpGrantFields({
  value,
  allowed,
  onChange,
}: McpGrantFieldsProps) {
  return (
    <div className={styles.tools}>
      <label>
        <UiSwitch
          checked={value.repositoryRead}
          disabled={!allowed.repositoryRead}
          onChange={(event) =>
            onChange({ ...value, repositoryRead: event.target.checked })
          }
        />
        Чтение репозитория
      </label>
      <label>
        <UiSwitch
          checked={value.pagesRead}
          disabled={!allowed.pagesRead}
          onChange={(event) =>
            onChange({ ...value, pagesRead: event.target.checked })
          }
        />
        Чтение страниц с моими правами
      </label>
      <label>
        <UiSwitch
          checked={value.workshopRead === true}
          disabled={!allowed.workshopRead}
          onChange={(event) =>
            onChange({
              ...value,
              workshopRead: event.target.checked,
              workshopWrite:
                event.target.checked && value.workshopWrite === true,
              workshopPreview:
                event.target.checked && value.workshopPreview === true,
            })
          }
        />
        Мастерская: читать мои проекты
      </label>
      <label>
        <UiSwitch
          checked={value.workshopWrite === true}
          disabled={!allowed.workshopWrite || !value.workshopRead}
          onChange={(event) =>
            onChange({ ...value, workshopWrite: event.target.checked })
          }
        />
        Мастерская: создавать проекты и сохранять правки
      </label>
      <label>
        <UiSwitch
          checked={value.workshopPreview === true}
          disabled={!allowed.workshopPreview || !value.workshopRead}
          onChange={(event) =>
            onChange({ ...value, workshopPreview: event.target.checked })
          }
        />
        Мастерская: запускать и просматривать preview
      </label>
    </div>
  );
}
