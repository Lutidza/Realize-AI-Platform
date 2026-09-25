/**
 * @file packages/payload-ai-plugin/src/admin/mcp-servers/McpHostedFields.component.tsx
 * @version 1.0.0
 * @date 2026-09-23
 * @description Редактирует разрешённые host settings, инструменты и пределы собственного MCP.
 */
import type {
  McpHostedConfiguration,
  McpHostProfileDto,
} from "@realize/ai-contracts";
import { MCP_REALIZE_TOOLS } from "@realize/ai-contracts";
import { UiInput, UiSelect, UiSwitch } from "@realize/ui-kit";
import styles from "./McpServers.module.css";
export function McpHostedFields({
  value,
  profiles,
  onChange,
}: {
  value: McpHostedConfiguration;
  profiles: McpHostProfileDto[];
  onChange: (value: McpHostedConfiguration) => void;
}) {
  const profile = profiles.find((entry) => entry.id === value.hostProfileID);
  const limitLabels = {
    callsPerMinute: "Вызовов в минуту",
    burst: "Короткая серия вызовов",
    concurrentCalls: "Одновременных вызовов",
    responseBytes: "Максимум байт в ответе",
  };
  return (
    <>
      <div className={styles.grid}>
        <label className={styles.field}>
          Место исполнения
          <UiSelect
            required
            value={value.hostProfileID}
            onChange={(event) => {
              const next = profiles.find(
                (entry) => entry.id === event.target.value,
              );
              if (next)
                onChange({
                  ...value,
                  hostProfileID: next.id,
                  port: next.allowedPorts[0],
                  limits: { ...next.maximumLimits },
                });
            }}
          >
            <option value="">Выберите профиль оператора</option>
            {profiles.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.label}
              </option>
            ))}
          </UiSelect>
          <small>
            {profile?.reason ??
              "Профиль и разрешённые адреса задаёт оператор установки."}
          </small>
        </label>
        <label className={styles.field}>
          Порт
          <UiSelect
            required
            value={value.port}
            onChange={(event) =>
              onChange({ ...value, port: Number(event.target.value) })
            }
          >
            {profile?.allowedPorts.map((port) => (
              <option key={port} value={port}>
                {port}
              </option>
            ))}
          </UiSelect>
          <small>
            Изменение порта требует перезапуска процесса оператором.
          </small>
        </label>
      </div>
      <fieldset>
        <legend>Доступные инструменты</legend>
        <div className={styles.tools}>
          {MCP_REALIZE_TOOLS.map((tool) => (
            <label key={tool}>
              <UiSwitch
                checked={value.allowedTools.includes(tool)}
                onChange={(event) =>
                  onChange({
                    ...value,
                    allowedTools: event.target.checked
                      ? [...value.allowedTools, tool]
                      : value.allowedTools.filter((item) => item !== tool),
                  })
                }
              />
              {tool}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend>Ограничения вызовов</legend>
        <div className={styles.grid}>
          {(Object.keys(limitLabels) as (keyof typeof limitLabels)[]).map(
            (key) => (
              <label key={key} className={styles.field}>
                {limitLabels[key]}
                <UiInput
                  required
                  type="number"
                  min={key === "responseBytes" ? 8192 : 1}
                  max={profile?.maximumLimits[key] ?? value.limits[key]}
                  value={value.limits[key]}
                  onChange={(event) =>
                    onChange({
                      ...value,
                      limits: {
                        ...value.limits,
                        [key]: Number(event.target.value),
                      },
                    })
                  }
                />
              </label>
            ),
          )}
        </div>
      </fieldset>
    </>
  );
}
