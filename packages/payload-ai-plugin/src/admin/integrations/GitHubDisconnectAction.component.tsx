/**
 * @file packages/payload-ai-plugin/src/admin/integrations/GitHubDisconnectAction.component.tsx
 * @version 1.0.1
 * @date 2026-09-09
 * @description Отображает отключение GitHub отдельно от действий редактирования.
 */

import { UiButton, UiSurface } from "@realize/ui-kit";
import { Unplug } from "lucide-react";
import type { GitHubDisconnectActionProps } from "./GitHubDisconnectAction.types";
import styles from "./IntegrationDisconnectAction.module.css";

export const GitHubDisconnectAction = ({
  busyAction,
  isBusy,
  onDisconnect,
}: GitHubDisconnectActionProps) => (
  <UiSurface asChild>
    <section className={styles.disconnect}>
      <h2>Отключение</h2>
      <p>Удалит сохранённые настройки и токен этого подключения.</p>
      <UiButton
        disabled={isBusy}
        onClick={() => void onDisconnect()}
        variant="danger"
      >
        <Unplug aria-hidden="true" size={17} />
        {busyAction === "disconnect" ? "Отключение…" : "Отключить"}
      </UiButton>
    </section>
  </UiSurface>
);
