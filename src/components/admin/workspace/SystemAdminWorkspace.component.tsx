/**
 * @file src/components/admin/workspace/SystemAdminWorkspace.component.tsx
 * @version 1.0.0
 * @date 2026-10-12
 * @description Открывает самостоятельную рабочую область с переходами к доступным модулям.
 * @see documentation/architecture/system-admin-shell.md
 */
"use client";
import { UiNotice, UiSurface } from "@realize/ui-kit";
import type { SystemAdminContext } from "../system-shell/systemAdmin.types";
import { SystemAdminTemplateHost } from "../system-shell/SystemAdminTemplateHost.component";
import { useSystemAdminTheme } from "../system-shell/useSystemAdminTheme.hook";
import { useSystemAdminLocale } from "../system-shell/useSystemAdminLocale.hook";
import { useSystemAdminNavigationPreferences } from "../system-shell/useSystemAdminNavigationPreferences.hook";
import { getSystemAdminNavigation } from "../system-shell/systemAdmin.navigation";
import {
  SYSTEM_TASK_MANAGER_ROUTE,
  SYSTEM_APPEARANCE_ROUTE,
  SYSTEM_WORKSHOP_ROUTE,
} from "../system-shell/systemAdmin.routes";
import styles from "./SystemAdminWorkspace.module.css";

/** Только существующие модули; эта страница не подменяет их domain controllers. */
export function SystemAdminWorkspace(props: SystemAdminContext) {
  const { theme, setTheme } = useSystemAdminTheme(props);
  const { locale, setLocale } = useSystemAdminLocale();
  const preferences = useSystemAdminNavigationPreferences();
  return (
    <SystemAdminTemplateHost
      screen="workspace"
      mode={theme}
      onModeChange={setTheme}
      locale={locale}
      onLocaleChange={setLocale}
      {...preferences}
      navigation={getSystemAdminNavigation({
        onTasks: () => window.location.assign(SYSTEM_TASK_MANAGER_ROUTE),
      })}
      activeNavigationId="home"
      context="Рабочая область"
      capabilities={{
        account: {
          user: {
            name: props.currentActor.name,
            initials: props.currentActor.name.slice(0, 2).toUpperCase(),
          },
          profileActions: [],
        },
      }}
    >
      <div className={styles.content}>
        <div>
          <h1>Рабочая область</h1>
          <p>Задачи, Мастерская и оформление платформы.</p>
        </div>
        {props.adminShell?.requiresRecovery && (
          <UiNotice title="Сохранённая оболочка недоступна">
            Открыт доступный вариант. Проверьте выбор в разделе «Темы и
            шаблоны».
          </UiNotice>
        )}
        <div className={styles.modules}>
          {[
            {
              title: "Task Manager",
              href: SYSTEM_TASK_MANAGER_ROUTE,
              description: "Проекты, списки и постоянные задачи команды.",
            },
            {
              title: "Мастерская",
              href: SYSTEM_WORKSHOP_ROUTE,
              description: "Дизайн-проекты, референсы и версии макетов.",
            },
            {
              title: "Темы и шаблоны",
              href: SYSTEM_APPEARANCE_ROUTE,
              description:
                "Оболочка Admin, пакет, палитра и настройки оформления.",
            },
          ].map((item) => (
            <UiSurface key={item.href} className={styles.module}>
              <h2>
                <a href={item.href}>{item.title}</a>
              </h2>
              <p>{item.description}</p>
            </UiSurface>
          ))}
        </div>
      </div>
    </SystemAdminTemplateHost>
  );
}
