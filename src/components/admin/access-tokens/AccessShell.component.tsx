/**
 * @file src/components/admin/access-tokens/AccessShell.component.tsx
 * @version 1.0.0
 * @date 2026-10-19
 * @description Встраивает управление доступами в общую системную оболочку.
 * @see documentation/architecture/platform-access.md
 */
"use client";
import { usePathname } from "next/navigation";
import { SystemAdminTemplateHost } from "../system-shell/SystemAdminTemplateHost.component";
import { getSystemAdminNavigation } from "../system-shell/systemAdmin.navigation";
import { SYSTEM_TASK_MANAGER_ROUTE } from "../system-shell/systemAdmin.routes";
import { useSystemAdminTheme } from "../system-shell/useSystemAdminTheme.hook";
import { useSystemAdminLocale } from "../system-shell/useSystemAdminLocale.hook";
import { useSystemAdminNavigationPreferences } from "../system-shell/useSystemAdminNavigationPreferences.hook";
import type { AccessShellProps } from "./AccessTokens.types";

/** Domain state и секреты остаются у страницы, theme/navigation переиспользуют host. */
export function AccessShell({ context, title, children }: AccessShellProps) {
  const { theme, setTheme } = useSystemAdminTheme(context);
  const { locale, setLocale } = useSystemAdminLocale();
  const preferences = useSystemAdminNavigationPreferences();
  const pathname = usePathname();
  return (
    <SystemAdminTemplateHost
      screen="workspace"
      mode={theme}
      onModeChange={setTheme}
      locale={locale}
      onLocaleChange={setLocale}
      {...preferences}
      navigation={getSystemAdminNavigation({
        currentPath: pathname,
        onTasks: () => window.location.assign(SYSTEM_TASK_MANAGER_ROUTE),
      })}
      activeNavigationId="settings"
      context={title}
      capabilities={{
        account: {
          user: {
            name: context.currentActor.name,
            initials: context.currentActor.name.slice(0, 2).toUpperCase(),
          },
          profileActions: [],
        },
      }}
    >
      {children}
    </SystemAdminTemplateHost>
  );
}
