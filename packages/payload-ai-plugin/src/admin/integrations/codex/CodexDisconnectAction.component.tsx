/**
 * @file packages/payload-ai-plugin/src/admin/integrations/codex/CodexDisconnectAction.component.tsx
 * @version 1.0.0
 * @date 2026-09-09
 * @description Отображает отдельное действие удаления сохранённого подключения Codex.
 */

import { UiButton, UiSurface } from "@realize/ui-kit";
import { Unplug } from "lucide-react";
import styles from "../IntegrationDisconnectAction.module.css";
import type { CodexConnectionFieldsProps } from "./CodexConnectionFields.types";

export const CodexDisconnectAction = ({ form }: CodexConnectionFieldsProps) => (
  <UiSurface asChild>
    <section className={styles.disconnect}>
      <h2>Отключение</h2>
      <p>Удалит сохранённые настройки и данные доступа Codex.</p>
      <UiButton
        aria-busy={form.operations.busyAction === "disconnect"}
        disabled={form.isBusy}
        onClick={() => void form.disconnect()}
        variant="danger"
      >
        <Unplug aria-hidden="true" size={17} />
        Отключить
      </UiButton>
    </section>
  </UiSurface>
);
