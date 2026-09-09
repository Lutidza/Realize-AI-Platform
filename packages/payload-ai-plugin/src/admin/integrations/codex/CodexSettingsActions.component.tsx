/**
 * @file packages/payload-ai-plugin/src/admin/integrations/codex/CodexSettingsActions.component.tsx
 * @version 1.0.0
 * @date 2026-09-09
 * @description Отображает сохранение и проверку доступа Codex без платного запроса к модели.
 */

import { UiButton, UiSurface } from "@realize/ui-kit";
import { LoaderCircle, Save, ShieldCheck } from "lucide-react";
import styles from "../IntegrationSettingsActions.module.css";
import type { CodexConnectionFieldsProps } from "./CodexConnectionFields.types";

export const CodexSettingsActions = ({ form }: CodexConnectionFieldsProps) => (
  <UiSurface asChild>
    <footer className={styles.actions}>
      <p>
        {form.hasUnsavedAccess
          ? "Сначала сохраните выбранный способ доступа для проверки."
          : "Проверка доступа не отправляет платный запрос к модели."}
      </p>
      <div className={styles.buttons}>
        <UiButton
          aria-busy={form.operations.busyAction === "test"}
          disabled={form.isBusy || !form.canTest}
          onClick={() => void form.test()}
          variant="secondary"
        >
          {form.operations.busyAction === "test" ? (
            <LoaderCircle
              aria-hidden="true"
              className={styles.spinner}
              size={18}
            />
          ) : (
            <ShieldCheck aria-hidden="true" size={18} />
          )}
          Проверить
        </UiButton>
        <UiButton
          aria-busy={form.operations.busyAction === "save"}
          disabled={form.isBusy || !form.canSave}
          onClick={() => void form.save()}
        >
          {form.operations.busyAction === "save" ? (
            <LoaderCircle
              aria-hidden="true"
              className={styles.spinner}
              size={18}
            />
          ) : (
            <Save aria-hidden="true" size={18} />
          )}
          Сохранить
        </UiButton>
      </div>
    </footer>
  </UiSurface>
);
