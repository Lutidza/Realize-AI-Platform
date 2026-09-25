/**
 * @file packages/payload-ai-plugin/src/admin/mcp-servers/McpServerStatus.component.tsx
 * @version 1.0.0
 * @date 2026-09-23
 * @description Разделяет доступ, подтверждение конфигурации и последнюю проверку MCP.
 */
import type { McpServerSummaryDto } from "@realize/ai-contracts";
import { UiBadge } from "@realize/ui-kit";
import styles from "./McpServers.module.css";
const labels = {
  unknown: "Состояние неизвестно",
  pending: "Ожидает применения",
  applying: "Применяется",
  applied: "Конфигурация применена",
  restart_required: "Требуется перезапуск",
  failed: "Ошибка применения",
  stale: "Нет свежего подтверждения",
};
export function McpServerStatus({ server }: { server: McpServerSummaryDto }) {
  return (
    <div className={styles.status}>
      <div className={styles.row}>
        <UiBadge tone={server.enabled ? "positive" : "neutral"}>
          {server.enabled ? "Доступ включён" : "Доступ выключен"}
        </UiBadge>
        <UiBadge
          tone={server.observed.status === "failed" ? "danger" : "neutral"}
        >
          {labels[server.observed.status]}
        </UiBadge>
      </div>
      {server.observed.reason && <p>{server.observed.reason}</p>}
      <p>
        Проверка:{" "}
        {server.lastTestStatus === "never"
          ? "не выполнялась"
          : server.lastTestStatus === "passed"
            ? "успешна"
            : "ошибка"}
        {server.lastTestedAt
          ? ` · ${new Date(server.lastTestedAt).toLocaleString("ru")}`
          : ""}
      </p>
    </div>
  );
}
