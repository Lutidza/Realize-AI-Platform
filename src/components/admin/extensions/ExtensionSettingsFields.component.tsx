/**
 * @file src/components/admin/extensions/ExtensionSettingsFields.component.tsx
 * @version 1.0.0
 * @date 2026-10-12
 * @description Отображает stateless schema-driven settings или полный JSON editor.
 */
import { UiInput, UiSelect, UiSwitch, UiTextarea } from "@realize/ui-kit";
import type { TemplateJsonValue } from "@realize/template-contracts";
import {
  extensionSettingsFields,
  readExtensionSettings,
} from "./extensionSettingsFields.util";
import type { ExtensionSettingsFieldsProps } from "./ExtensionManagerUi.types";
import styles from "./ExtensionManager.module.css";

export function ExtensionSettingsFields({
  schema,
  text,
  disabled,
  onChange,
}: ExtensionSettingsFieldsProps) {
  const parsed = readExtensionSettings(text);
  const fields = extensionSettingsFields(schema);
  if (!fields || !parsed.valid)
    return (
      <label className={styles.field}>
        Настройки JSON
        <UiTextarea
          value={text}
          disabled={disabled}
          rows={9}
          spellCheck={false}
          onChange={(event) => onChange(event.currentTarget.value)}
        />
        <span className={styles.muted}>
          {parsed.valid
            ? "Эта схема редактируется целиком в JSON."
            : parsed.message}
        </span>
      </label>
    );
  const change = (key: string, value: TemplateJsonValue | undefined) => {
    const settings = { ...parsed.value };
    if (value === undefined) delete settings[key];
    else settings[key] = value;
    onChange(JSON.stringify(settings, null, 2));
  };
  return (
    <div className={styles.settingsFields}>
      {fields.map((field) => (
        <label
          key={field.key}
          className={
            field.type === "boolean" ? styles.switchField : styles.field
          }
        >
          <span>
            {field.label}
            {field.required ? " *" : ""}
          </span>
          {field.type === "enum" && (
            <UiSelect
              value={
                typeof parsed.value[field.key] === "string"
                  ? (parsed.value[field.key] as string)
                  : ""
              }
              disabled={disabled}
              required={field.required}
              onChange={(event) => change(field.key, event.currentTarget.value)}
            >
              {!parsed.value[field.key] && (
                <option value="">Выберите значение</option>
              )}
              {field.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </UiSelect>
          )}
          {field.type === "integer" && (
            <UiInput
              type="number"
              inputMode="numeric"
              step={1}
              min={field.minimum}
              max={field.maximum}
              value={
                typeof parsed.value[field.key] === "number"
                  ? (parsed.value[field.key] as number)
                  : ""
              }
              disabled={disabled}
              required={field.required}
              onChange={(event) =>
                change(
                  field.key,
                  event.currentTarget.value === ""
                    ? undefined
                    : event.currentTarget.valueAsNumber,
                )
              }
            />
          )}
          {field.type === "boolean" && (
            <UiSwitch
              checked={parsed.value[field.key] === true}
              disabled={disabled}
              onChange={(event) =>
                change(field.key, event.currentTarget.checked)
              }
            />
          )}
          {field.description && (
            <span className={styles.muted}>{field.description}</span>
          )}
        </label>
      ))}
    </div>
  );
}
