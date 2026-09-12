/**
 * @file packages/payload-ai-plugin/src/admin/agent-layer-settings/AgentLayerCatalogCreation.component.tsx
 * @version 1.0.0
 * @date 2026-09-10
 * @description Показывает одно действие создания с выбором вида в общем каталоге.
 */

import { UiButton, UiSelect } from "@realize/ui-kit";
import { Plus } from "lucide-react";
import type { AgentLayerCatalogCreationProps } from "./AgentLayerCatalog.types";
import {
  AGENT_LAYER_CREATE_LABELS,
  AGENT_LAYER_EDITABLE_KINDS,
} from "./agentLayerEditableKinds.config";
import { AGENT_LAYER_KIND_LABELS } from "./agentLayerPresentation.util";
import { useAgentLayerCatalogCreation } from "./useAgentLayerCatalogCreation.hook";
import styles from "./AgentLayerCatalog.module.css";

/** Действие создания открывает локальную форму; запись выполняет редактор после сохранения. */
export const AgentLayerCatalogCreation = ({
  kind,
  onCreate,
  disabled,
  isAtLimit,
}: AgentLayerCatalogCreationProps) => {
  const { createKind, selectKind } = useAgentLayerCatalogCreation(kind);
  if (!createKind) return null;
  const isDisabled = disabled || isAtLimit;
  const limitHint = isAtLimit
    ? "Достигнут лимит 512 записей в черновике"
    : undefined;

  return (
    <div className={styles.createActions}>
      {!kind && (
        <label className={styles.creationField}>
          <span>Тип новой записи</span>
          <UiSelect
            value={createKind}
            onChange={(event) => selectKind(event.target.value)}
            disabled={isDisabled}
            title={limitHint}
          >
            {AGENT_LAYER_EDITABLE_KINDS.map((editableKind) => (
              <option key={editableKind} value={editableKind}>
                {AGENT_LAYER_KIND_LABELS[editableKind]}
              </option>
            ))}
          </UiSelect>
        </label>
      )}
      <UiButton
        onClick={() => onCreate(createKind)}
        disabled={isDisabled}
        title={limitHint}
      >
        <Plus size={16} aria-hidden="true" />
        {kind ? AGENT_LAYER_CREATE_LABELS[createKind] : "Создать запись"}
      </UiButton>
    </div>
  );
};
