/**
 * @file src/components/admin/design-workshop/DesignWorkshopHost.component.tsx
 * @version 1.0.0
 * @date 2026-09-25
 * @description Подключает переносимый редактор Мастерской к системной оболочке Realize.
 * @see documentation/specifications/design-workshop.md
 */

"use client";
import { useState } from "react";
import { WandSparkles } from "lucide-react";
import { DesignWorkshopClient } from "@realize/payload-ai-control/workshop-client";
import {
  SystemAdminBreadcrumbs,
  SystemAdminNavigationGroups,
  SystemAdminShell,
} from "@realize/ui-kit";
import { getSystemAdminNavigation } from "../system-shell/systemAdmin.navigation";
import { SYSTEM_ADMIN_WORKSHOP_NAVIGATION } from "../system-shell/systemAdminWorkshop.navigation";
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
    <SystemAdminShell
      theme={theme}
      onThemeChange={setTheme}
      locale={locale}
      navigation={getSystemAdminNavigation({
        onTasks: () =>
          window.location.assign(SYSTEM_TASK_MANAGER_REFERENCE_ROUTE),
      })}
      activeNavigationId="workshop"
      {...preferences}
      breadcrumbs={
        projectId ? (
          <SystemAdminBreadcrumbs
            items={[
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
            ]}
          />
        ) : undefined
      }
      backAction={
        projectId
          ? {
              label: "Все проекты",
              onSelect: () => window.location.assign(SYSTEM_WORKSHOP_ROUTE),
            }
          : undefined
      }
      headerActions={
        <span className={styles.context}>
          <WandSparkles size={16} />
          Мастерская дизайна
        </span>
      }
      secondaryNavigation={(onNavigate) => (
        <div className={styles.sidebar}>
          <div className={styles.heading}>
            <span className={styles.mark}>
              <WandSparkles size={22} />
            </span>
            <h2>Мастерская</h2>
            <p>Идеи. Дизайн. Итерации.</p>
          </div>
          <SystemAdminNavigationGroups
            groups={SYSTEM_ADMIN_WORKSHOP_NAVIGATION.map((group) => ({
              ...group,
              items: group.items.map((item) => ({
                ...item,
                active: !projectId && item.id === "workshop-library",
              })),
            }))}
            onNavigate={onNavigate}
          />
          <div className={styles.note}>
            <strong>Контекст проекта</strong>
            <p>
              Бриф, материалы и сохранённые версии помогают продолжать работу с
              того же места.
            </p>
          </div>
        </div>
      )}
    >
      <DesignWorkshopClient
        projectId={projectId}
        baseHref={SYSTEM_WORKSHOP_ROUTE}
        theme={theme}
      />
    </SystemAdminShell>
  );
}
