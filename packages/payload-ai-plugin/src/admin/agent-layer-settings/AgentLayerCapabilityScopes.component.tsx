/**
 * @file packages/payload-ai-plugin/src/admin/agent-layer-settings/AgentLayerCapabilityScopes.component.tsx
 * @version 1.0.0
 * @date 2026-09-10
 * @description Показывает явное наследование или сужение одной области доступа возможности.
 */

import { UiBadge, UiNotice, UiSwitch } from "@realize/ui-kit";
import { ChevronDown } from "lucide-react";
import type { AgentLayerCapabilityScopesProps } from "./AgentLayerBindingEditor.types";
import { AgentLayerChoiceList } from "./AgentLayerChoiceList.component";
import { useAgentLayerChoiceList } from "./useAgentLayerChoiceList.hook";
import styles from "./AgentLayerProfileEditor.module.css";

/** Переключение на собственный состав начинает с явного запрета всех областей. */
export const AgentLayerCapabilityScopes = ({
  id,
  label,
  systemScopes,
  value,
  hasDescriptor,
  disabled,
  onChange,
}: AgentLayerCapabilityScopesProps) => {
  const inherited = value === undefined;
  const picker = useAgentLayerChoiceList({
    options: systemScopes.map((key) => ({ key, title: key })),
    selectedKeys: value ?? systemScopes,
    disabled: disabled || inherited,
    onChange,
  });
  return (
    <details className={styles.referenceGroup}>
      <summary className={styles.groupSummary}>
        <ChevronDown size={17} aria-hidden="true" />
        <strong>{label}</strong>
        <span className={styles.groupCounts}>
          <UiBadge>
            {inherited
              ? "По системной основе"
              : `Выбрано: ${picker.selectedCount}`}
          </UiBadge>
          {picker.missingCount > 0 && (
            <UiBadge tone="danger">Не найдено: {picker.missingCount}</UiBadge>
          )}
        </span>
      </summary>
      <div className={styles.picker}>
        <label className={styles.switchRow}>
          <span>
            <strong id={`${id}-inherit-label`}>
              Наследовать из системной основы
            </strong>
            <small className={styles.muted} id={`${id}-inherit-hint`}>
              {inherited
                ? hasDescriptor
                  ? `Доступно областей: ${systemScopes.length}.`
                  : "Состав станет известен после выбора доступной системной версии."
                : "Выберите разрешённые области. Пустой состав запрещает все области этого вида."}
            </small>
          </span>
          <UiSwitch
            checked={inherited}
            disabled={disabled}
            aria-label={`${label}: наследовать из системной основы`}
            aria-describedby={`${id}-inherit-hint`}
            onChange={(event) =>
              onChange(event.target.checked ? undefined : [])
            }
          />
        </label>
        {picker.missingCount > 0 && (
          <UiNotice tone="danger">
            Сохранённые области отсутствуют у выбранной системной версии. Они
            сохранены в форме; уберите их явно или выберите подходящую версию.
          </UiNotice>
        )}
        <AgentLayerChoiceList
          label={label}
          picker={picker}
          emptyLabel={
            inherited
              ? "Системная версия не содержит областей этого вида."
              : "У выбранной системной версии нет доступных областей этого вида."
          }
        />
      </div>
    </details>
  );
};
