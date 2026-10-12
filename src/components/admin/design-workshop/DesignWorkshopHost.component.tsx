/**
 * @file src/components/admin/design-workshop/DesignWorkshopHost.component.tsx
 * @version 1.1.0
 * @date 2026-10-12
 * @description Подключает переносимый редактор Мастерской к нейтральному template host.
 * @see documentation/specifications/design-workshop.md
 */

"use client";
import { useState } from "react";
import { WandSparkles } from "lucide-react";
import { DesignWorkshopClient } from "@realize/payload-ai-control/workshop-client";
import { SystemAdminTemplateHost } from "../system-shell/SystemAdminTemplateHost.component";
import { getSystemAdminNavigation } from "../system-shell/systemAdmin.navigation";
import {
  SYSTEM_TASK_MANAGER_REFERENCE_ROUTE,
  SYSTEM_WORKSHOP_ROUTE,
} from "../system-shell/systemAdmin.routes";
import { useSystemAdminNavigationPreferences } from "../system-shell/useSystemAdminNavigationPreferences.hook";
import { useSystemAdminLocale } from "../system-shell/useSystemAdminLocale.hook";
import type { DesignWorkshopHostProps } from "./DesignWorkshopHost.types";
import styles from "./DesignWorkshopHost.module.css";

/** Host подключает общий shell и реальные маршруты; domain client не импортирует Payload UI. */
export function DesignWorkshopHost({
  initialTheme,
  projectId,
}: DesignWorkshopHostProps) {
  const [theme, setTheme] = useState(initialTheme);
  const preferences = useSystemAdminNavigationPreferences();
  const { locale } = useSystemAdminLocale();
  return (
    <SystemAdminTemplateHost
      screen="workspace"
      mode={theme}
      onModeChange={setTheme}
      locale={locale}
      navigation={getSystemAdminNavigation({
        onTasks: () =>
          window.location.assign(SYSTEM_TASK_MANAGER_REFERENCE_ROUTE),
      }).map((item) =>
        item.id === "workshop"
          ? {
              ...item,
              groups: item.groups?.map((group) => ({
                ...group,
                items: group.items.map((link) => ({
                  ...link,
                  active: !projectId && link.id === "workshop-library",
                })),
              })),
            }
          : item,
      )}
      activeNavigationId="workshop"
      {...preferences}
      breadcrumbs={
        projectId
          ? [
              {
                id: "workshop",
                label: "Мастерская",
                onSelect: () => window.location.assign(SYSTEM_WORKSHOP_ROUTE),
              },
              {
                id: "project",
                label: "Дизайн-проект",
                onSelect: () => undefined,
              },
            ]
          : undefined
      }
      backAction={
        projectId
          ? {
              label: "Все проекты",
              onSelect: () => window.location.assign(SYSTEM_WORKSHOP_ROUTE),
            }
          : undefined
      }
      context={
        <span className={styles.context}>
          <WandSparkles size={16} />
          Мастерская дизайна
        </span>
      }
    >
      <DesignWorkshopClient
        projectId={projectId}
        baseHref={SYSTEM_WORKSHOP_ROUTE}
        theme={theme}
      />
    </SystemAdminTemplateHost>
  );
}
