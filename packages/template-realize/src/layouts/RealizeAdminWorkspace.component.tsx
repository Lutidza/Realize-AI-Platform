/**
 * @file packages/template-realize/src/layouts/RealizeAdminWorkspace.component.tsx
 * @version 1.0.0
 * @date 2026-10-12
 * @description Отображает нейтральный workspace contract через единственную композицию Realize.
 * @see documentation/architecture/system-admin-shell.md
 */
import type { TemplateAdminWorkspaceProps } from "@realize/template-contracts/react";
import { UiButton } from "@realize/ui-kit";
import { SystemAdminShell } from "./admin/SystemAdminShell.component";
import { SystemAdminToolbar } from "./admin/SystemAdminToolbar.component";
import { SystemAdminBreadcrumbs } from "./admin/SystemAdminBreadcrumbs.component";
import { SystemAdminNavigationGroups } from "./admin/SystemAdminNavigationGroups.component";
import styles from "./RealizeWorkspace.module.css";

/** Все права, данные и callbacks уже подготовлены host; отсутствующая capability не имитируется. */
export function RealizeAdminWorkspace(props: TemplateAdminWorkspaceProps) {
  const active = props.navigation.find(
    (item) => item.id === props.activeNavigationId,
  );
  const capabilities = props.capabilities;
  const secondaryNavigation =
    props.secondaryNavigation ??
    ((onNavigate: () => void) => (
      <div className={styles.navigation}>
        {active && <h2 className={styles.heading}>{active.label}</h2>}
        {!!active?.groups?.length && (
          <SystemAdminNavigationGroups
            groups={active.groups}
            onNavigate={onNavigate}
          />
        )}
      </div>
    ));
  return (
    <SystemAdminShell
      locale={props.locale}
      theme={props.mode}
      onThemeChange={props.onModeChange}
      brand={props.brand}
      navigation={props.navigation}
      activeNavigationId={props.activeNavigationId}
      navigationPreferences={props.navigationPreferences}
      onNavigationPreferencesChange={props.onNavigationPreferencesChange}
      secondaryNavigation={secondaryNavigation}
      backAction={props.backAction}
      toolbar={
        <SystemAdminToolbar
          context={props.context ?? active?.label}
          theme={props.mode}
          onThemeChange={props.onModeChange}
          locale={props.locale}
          onLocaleChange={props.onLocaleChange}
          searchEntries={capabilities?.search?.entries}
          createActions={capabilities?.create?.actions}
          onCreate={capabilities?.create?.onCreate}
          onAssistant={capabilities?.assistant?.onSelect}
          notifications={capabilities?.notifications?.items}
          onReadAll={capabilities?.notifications?.onReadAll}
          user={capabilities?.account?.user}
          profileActions={capabilities?.account?.profileActions}
          billingActions={capabilities?.account?.billingActions}
          signOutAction={capabilities?.account?.signOutAction}
        />
      }
      breadcrumbs={
        props.breadcrumbs?.length ? (
          <SystemAdminBreadcrumbs
            locale={props.locale}
            items={props.breadcrumbs}
          />
        ) : undefined
      }
      contentActions={
        props.pageActions?.length
          ? props.pageActions.map((action) => (
              <UiButton
                key={action.id}
                disabled={action.disabled}
                onClick={action.onSelect}
              >
                {action.icon}
                {action.label}
              </UiButton>
            ))
          : undefined
      }
      footer={props.footer}
    >
      {props.content}
    </SystemAdminShell>
  );
}
