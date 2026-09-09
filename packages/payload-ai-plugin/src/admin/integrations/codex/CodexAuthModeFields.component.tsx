/**
 * @file packages/payload-ai-plugin/src/admin/integrations/codex/CodexAuthModeFields.component.tsx
 * @version 1.1.0
 * @date 2026-09-09
 * @description Отображает единый выбор поддерживаемых способов подключения Codex.
 */

import { UiSurface } from "@realize/ui-kit";
import type { CodexAuthModeFieldsProps } from "./CodexConnectionFields.types";
import styles from "./CodexConnectionFields.module.css";
import { codexAuthOptions } from "./codexAuthOptions.config";

/** Нативные radio сохраняют клавиатурную навигацию и единственный выбор в группе. */
export const CodexAuthModeFields = ({
  authMode,
  loginMethod,
  groupName,
  isDisabled,
  onChange,
}: CodexAuthModeFieldsProps) => (
  <fieldset className={styles.modeGroup} disabled={isDisabled}>
    <legend>Способ подключения</legend>
    <div className={styles.modeOptions}>
      {codexAuthOptions.map((option) => {
        const selected =
          authMode === option.authMode &&
          (!option.loginMethod || loginMethod === option.loginMethod);
        const value = option.loginMethod ?? option.authMode;
        return (
          <UiSurface asChild key={value} tone={selected ? "raised" : "default"}>
            <label className={styles.modeOption}>
              <input
                checked={selected}
                name={groupName}
                onChange={() => onChange(option.authMode, option.loginMethod)}
                type="radio"
                value={value}
              />
              <span>
                <strong>{option.label}</strong>
                <small>{option.description}</small>
              </span>
            </label>
          </UiSurface>
        );
      })}
    </div>
  </fieldset>
);
