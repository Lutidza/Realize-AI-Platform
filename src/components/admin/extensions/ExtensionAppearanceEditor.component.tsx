/**
 * @file src/components/admin/extensions/ExtensionAppearanceEditor.component.tsx
 * @version 1.0.0
 * @date 2026-10-12
 * @description Отображает активное назначение и управляемый черновик без исполнения mutation.
 */
import { UiBadge, UiButton, UiSelect, UiSurface } from "@realize/ui-kit";
import type { ExtensionAppearanceEditorProps } from "./ExtensionManagerUi.types";
import {
  extensionTemplateKey,
  findExtensionDraftEntry,
} from "./extensionAppearanceDraft.util";
import { readExtensionSettings } from "./extensionSettingsFields.util";
import { ExtensionSettingsFields } from "./ExtensionSettingsFields.component";
import styles from "./ExtensionManager.module.css";

export function ExtensionAppearanceEditor({
  entries,
  draft,
  active,
  revision,
  disabled,
  canPrepare,
  onTemplateChange,
  onPaletteChange,
  onModeChange,
  onSettingsChange,
  onPrepare,
}: ExtensionAppearanceEditorProps) {
  const entry = findExtensionDraftEntry(entries, draft);
  const palette = entry?.manifest.palettes.find(
    (item) =>
      item.id === draft.selection.paletteId &&
      item.version === draft.selection.paletteVersion,
  );
  const parsed = readExtensionSettings(draft.settingsText);
  return (
    <UiSurface id="appearance-assignment" className={styles.surface}>
      <div className={styles.sectionHeader}>
        <h2>Назначение оформления</h2>
        <UiBadge>Ревизия {revision}</UiBadge>
      </div>
      <div className={styles.stack}>
        <div className={styles.summary}>
          <strong>Текущее назначение:</strong>
          {active ? (
            <span>
              {active.selection.templateId} {active.selection.templateVersion} ·{" "}
              {active.selection.paletteId} ·{" "}
              {active.selection.mode === "light" ? "Светлый" : "Тёмный"}
            </span>
          ) : (
            <span className={styles.muted}>
              Встроенное оформление; отдельного назначения ещё нет.
            </span>
          )}
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (canPrepare && parsed.valid && !disabled) onPrepare();
          }}
        >
          <fieldset disabled={disabled} className={styles.fieldset}>
            <div className={styles.formGrid}>
              <label className={styles.field}>
                Шаблон и версия
                <UiSelect
                  value={`${draft.selection.templateId}@${draft.selection.templateVersion}`}
                  onChange={(event) =>
                    onTemplateChange(event.currentTarget.value)
                  }
                  required
                >
                  {!entry && (
                    <option
                      value={`${draft.selection.templateId}@${draft.selection.templateVersion}`}
                    >
                      Недоступная версия: {draft.selection.templateId}{" "}
                      {draft.selection.templateVersion}
                    </option>
                  )}
                  {entries.map((item) => (
                    <option
                      key={extensionTemplateKey(item)}
                      value={extensionTemplateKey(item)}
                    >
                      {item.manifest.displayName} · {item.manifest.version}
                    </option>
                  ))}
                </UiSelect>
              </label>
              <label className={styles.field}>
                Палитра
                <UiSelect
                  value={draft.selection.paletteId}
                  onChange={(event) =>
                    onPaletteChange(event.currentTarget.value)
                  }
                  required
                >
                  {entry?.manifest.palettes.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label} · {item.version}
                    </option>
                  ))}
                </UiSelect>
              </label>
              <label className={styles.field}>
                Режим назначения
                <UiSelect
                  value={draft.selection.mode}
                  onChange={(event) =>
                    onModeChange(event.currentTarget.value as "light" | "dark")
                  }
                  required
                >
                  {palette?.modes.map((mode) => (
                    <option key={mode} value={mode}>
                      {mode === "light" ? "Светлый" : "Тёмный"}
                    </option>
                  ))}
                </UiSelect>
                <span className={styles.muted}>
                  Режим будущего назначения; переключатель верхней панели меняет
                  текущий экран.
                </span>
              </label>
            </div>
            {entry && (
              <ExtensionSettingsFields
                schema={entry.settingsSchema}
                text={draft.settingsText}
                disabled={disabled}
                onChange={onSettingsChange}
              />
            )}
            <div className={styles.actions}>
              <UiButton
                type="submit"
                disabled={!canPrepare || !parsed.valid || !entry}
              >
                Подготовить изменение
              </UiButton>
              <span className={styles.muted}>
                Сначала сформируется план для проверки и предпросмотра.
              </span>
            </div>
          </fieldset>
        </form>
      </div>
    </UiSurface>
  );
}
