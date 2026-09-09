/**
 * @file packages/payload-ai-plugin/src/admin/integrations/GitHubSettingsActions.component.tsx
 * @version 1.0.1
 * @date 2026-09-09
 * @description Отображает доступные действия проверки и сохранения настроек GitHub.
 */

import { UiButton, UiSurface } from "@realize/ui-kit";
import { LoaderCircle, Save, ShieldCheck } from "lucide-react";
import type { GitHubSettingsActionsProps } from "./GitHubSettingsActions.types";
import styles from "./IntegrationSettingsActions.module.css";

export const GitHubSettingsActions = ({
  busyAction,
  form,
}: GitHubSettingsActionsProps) => (
  <UiSurface asChild>
    <footer className={styles.actions}>
      <p>Изменения применяются после сохранения.</p>
      <div className={styles.buttons}>
        <UiButton
          disabled={form.isBusy || !form.canTest}
          onClick={() => void form.test()}
          variant="secondary"
        >
          {busyAction === "test" ? (
            <LoaderCircle
              aria-hidden="true"
              className={styles.spinner}
              size={18}
            />
          ) : (
            <ShieldCheck aria-hidden="true" size={18} />
          )}
          {busyAction === "test" ? "Проверка…" : "Проверить"}
        </UiButton>
        <UiButton
          disabled={form.isBusy || !form.canSave}
          onClick={() => void form.save()}
        >
          {busyAction === "save" ? (
            <LoaderCircle
              aria-hidden="true"
              className={styles.spinner}
              size={18}
            />
          ) : (
            <Save aria-hidden="true" size={18} />
          )}
          {busyAction === "save" ? "Сохранение…" : "Сохранить"}
        </UiButton>
      </div>
    </footer>
  </UiSurface>
);
