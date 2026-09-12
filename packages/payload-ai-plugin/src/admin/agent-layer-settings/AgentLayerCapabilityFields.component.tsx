/**
 * @file packages/payload-ai-plugin/src/admin/agent-layer-settings/AgentLayerCapabilityFields.component.tsx
 * @version 1.0.0
 * @date 2026-09-10
 * @description Отображает точную системную цель, действия и ограничения привязки возможности.
 */

import { UiBadge, UiInput, UiNotice } from "@realize/ui-kit";
import { ChevronDown } from "lucide-react";
import type { AgentLayerCapabilityFieldsProps } from "./AgentLayerBindingEditor.types";
import { AgentLayerCapabilityScopes } from "./AgentLayerCapabilityScopes.component";
import { AgentLayerChoiceList } from "./AgentLayerChoiceList.component";
import { useAgentLayerChoiceList } from "./useAgentLayerChoiceList.hook";
import styles from "./AgentLayerProfileEditor.module.css";
import detailStyles from "./AgentLayerSettings.module.css";

/** Смена цели не удаляет введённые ограничения: несовместимые значения остаются видимыми. */
export const AgentLayerCapabilityFields = ({
  id,
  fields,
  system,
  disabled,
  onChange,
}: AgentLayerCapabilityFieldsProps) => {
  const selectedKey = JSON.stringify([
    fields.capability.id,
    fields.capability.version,
  ]);
  const hasSelection = Boolean(
    fields.capability.id || fields.capability.version,
  );
  const descriptor = system.capabilities.find(
    (item) =>
      item.id === fields.capability.id &&
      item.version === fields.capability.version,
  );
  const targets = system.capabilities.map((item) => ({
    key: JSON.stringify([item.id, item.version]),
    title: `${item.title} · ${item.version}`,
    code: `${item.id} · ${item.version}`,
    description: item.description,
  }));
  const targetPicker = useAgentLayerChoiceList({
    options:
      !descriptor && hasSelection
        ? [
            {
              key: selectedKey,
              title: fields.capability.id || "Идентификатор не задан",
              code: `Версия ${fields.capability.version || "не задана"}`,
              missing: true,
            },
            ...targets,
          ]
        : targets,
    selectedKeys: hasSelection ? [selectedKey] : [],
    mode: "single",
    disabled,
    onChange: (keys) => {
      const target = system.capabilities.find(
        (item) => JSON.stringify([item.id, item.version]) === keys[0],
      );
      if (target)
        onChange({
          ...fields,
          capability: { id: target.id, version: target.version },
        });
    },
  });
  const actionPicker = useAgentLayerChoiceList({
    options: (descriptor?.actions ?? []).map((key) => ({ key, title: key })),
    selectedKeys: fields.allowedActions,
    disabled,
    onChange: (allowedActions) => onChange({ ...fields, allowedActions }),
  });
  const requiredCheckPicker = useAgentLayerChoiceList({
    options: (descriptor?.requiredCheckIDs ?? []).map((key) => ({
      key,
      title: key,
    })),
    selectedKeys: [],
    disabled: true,
    mode: "readOnly",
    onChange: () => undefined,
  });
  const maxTargetsExceedsSystem =
    descriptor &&
    fields.maxTargets !== "" &&
    Number(fields.maxTargets) > descriptor.limits.maxTargets;
  return (
    <>
      <section className={styles.section} aria-labelledby={`${id}-target`}>
        <div className={styles.sectionHeader}>
          <div>
            <h3 id={`${id}-target`}>Системная возможность</h3>
            <p className={styles.muted}>
              Выберите действие и его точную версию из системной основы.
            </p>
          </div>
        </div>
        {hasSelection && !descriptor && (
          <UiNotice tone="danger" title="Системная версия не найдена">
            Сохранённая ссылка остаётся в форме. Выберите доступную версию или
            сохраните запись выключенной для последующей настройки.
          </UiNotice>
        )}
        {descriptor &&
          !descriptor.projectProfiles.includes(system.projectProfile) && (
            <UiNotice
              tone="danger"
              title="Возможность недоступна профилю проекта"
            >
              Выбранная версия предназначена для профилей:{" "}
              {descriptor.projectProfiles.join(", ") || "не указаны"}. Текущий
              профиль установки — {system.projectProfile}. Сохранённая ссылка
              остаётся в форме.
            </UiNotice>
          )}
        <AgentLayerChoiceList
          label="Системная возможность"
          picker={targetPicker}
          emptyLabel="Системные возможности не зарегистрированы."
        />
        {descriptor && (
          <dl className={detailStyles.details}>
            <div>
              <dt>Описание</dt>
              <dd>{descriptor.description}</dd>
            </div>
            <div>
              <dt>Класс и риск</dt>
              <dd>
                {descriptor.capabilityClass} · {descriptor.riskLevel}
              </dd>
            </div>
            <div>
              <dt>Системный лимит объектов</dt>
              <dd>{descriptor.limits.maxTargets}</dd>
            </div>
          </dl>
        )}
        {descriptor && (
          <details className={styles.referenceGroup}>
            <summary className={styles.groupSummary}>
              <ChevronDown size={17} aria-hidden="true" />
              <strong>Обязательные системные проверки</strong>
              <span className={styles.groupCounts}>
                <UiBadge>{descriptor.requiredCheckIDs.length}</UiBadge>
              </span>
            </summary>
            <div className={styles.picker}>
              <AgentLayerChoiceList
                label="Обязательные системные проверки"
                picker={requiredCheckPicker}
                emptyLabel="Обязательных проверок нет."
              />
            </div>
          </details>
        )}
      </section>
      <section
        className={styles.section}
        aria-labelledby={`${id}-restrictions`}
      >
        <div className={styles.sectionHeader}>
          <div>
            <h3 id={`${id}-restrictions`}>Действия и доступы</h3>
            <p className={styles.muted}>
              Привязка выбирает действия и сужает ограничения системной
              возможности.
            </p>
          </div>
        </div>
        <details className={styles.referenceGroup} open>
          <summary className={styles.groupSummary}>
            <ChevronDown size={17} aria-hidden="true" />
            <strong>Разрешённые действия</strong>
            <span className={styles.groupCounts}>
              <UiBadge>Выбрано: {actionPicker.selectedCount}</UiBadge>
              {actionPicker.missingCount > 0 && (
                <UiBadge tone="danger">
                  Не найдено: {actionPicker.missingCount}
                </UiBadge>
              )}
            </span>
          </summary>
          <div className={styles.picker}>
            {!fields.allowedActions.length && (
              <UiNotice tone="neutral">
                Действия пока не выбраны. Незавершённую запись можно сохранить в
                черновике; перед использованием задайте разрешённые действия.
              </UiNotice>
            )}
            {actionPicker.missingCount > 0 && (
              <UiNotice tone="danger">
                Сохранённые действия отсутствуют у выбранной системной версии.
                Уберите их явно или выберите подходящую версию.
              </UiNotice>
            )}
            <AgentLayerChoiceList
              label="Разрешённые действия"
              picker={actionPicker}
              emptyLabel="Выберите системную возможность, чтобы увидеть её действия."
            />
          </div>
        </details>
        <div className={styles.referenceGroups}>
          <AgentLayerCapabilityScopes
            id={`${id}-read`}
            label="Области чтения"
            value={fields.readScopes}
            systemScopes={descriptor?.scopes.read ?? []}
            hasDescriptor={Boolean(descriptor)}
            disabled={disabled}
            onChange={(readScopes) => onChange({ ...fields, readScopes })}
          />
          <AgentLayerCapabilityScopes
            id={`${id}-write`}
            label="Области записи"
            value={fields.writeScopes}
            systemScopes={descriptor?.scopes.write ?? []}
            hasDescriptor={Boolean(descriptor)}
            disabled={disabled}
            onChange={(writeScopes) => onChange({ ...fields, writeScopes })}
          />
        </div>
        <label className={styles.field} htmlFor={`${id}-max-targets`}>
          <span id={`${id}-max-targets-label`}>Максимум объектов</span>
          <UiInput
            id={`${id}-max-targets`}
            type="text"
            inputMode="numeric"
            value={fields.maxTargets}
            disabled={disabled}
            autoComplete="off"
            placeholder={
              descriptor
                ? `По системной основе: ${descriptor.limits.maxTargets}`
                : "По системной основе"
            }
            aria-labelledby={`${id}-max-targets-label`}
            aria-describedby={`${id}-max-targets-hint`}
            onChange={(event) =>
              onChange({ ...fields, maxTargets: event.target.value })
            }
          />
          <small className={styles.muted} id={`${id}-max-targets-hint`}>
            Пустое поле наследует системный лимит. Собственный лимит —
            положительное целое число
            {descriptor ? `, не больше ${descriptor.limits.maxTargets}` : ""}.
          </small>
        </label>
        {maxTargetsExceedsSystem && (
          <UiNotice tone="danger">
            Введённый лимит превышает ограничение выбранной системной версии.
            Уменьшите его или очистите поле, чтобы наследовать системный лимит.
          </UiNotice>
        )}
      </section>
    </>
  );
};
