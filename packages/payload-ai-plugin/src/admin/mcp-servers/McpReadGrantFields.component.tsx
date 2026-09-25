/**
 * @file packages/payload-ai-plugin/src/admin/mcp-servers/McpReadGrantFields.component.tsx
 * @version 1.0.0
 * @date 2026-09-25
 * @description Показывает одинаковый выбор прав для ручного клиента и подключения ChatGPT.
 */
import { UiSwitch } from "@realize/ui-kit";
import type { McpReadGrantFieldsProps } from "./McpServersClient.types";
import styles from "./McpServers.module.css";

export function McpReadGrantFields({
  value,
  allowed,
  onChange,
}: McpReadGrantFieldsProps) {
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
    </div>
  );
}
