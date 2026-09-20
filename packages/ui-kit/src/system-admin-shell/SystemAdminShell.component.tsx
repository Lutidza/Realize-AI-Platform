/**
 * @file packages/ui-kit/src/system-admin-shell/SystemAdminShell.component.tsx
 * @version 1.7.0
 * @date 2026-09-18
 * @description Собирает независимую системную оболочку с одной навигацией и мобильным focus trap.
 * @see documentation/architecture/system-admin-shell.md
 */

"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { ArrowLeft, Menu, Moon, Sun, X } from "lucide-react";
import { useId } from "react";
import { UiButton } from "../button/UiButton.component";
import { UiTheme } from "../theme/UiTheme.component";
import { SystemAdminNavigation } from "./SystemAdminNavigation.component";
import type { SystemAdminShellProps } from "./SystemAdminShell.types";
import { useSystemAdminNavigation } from "./useSystemAdminNavigation.hook";
import { useNavigationPreferences } from "./useNavigationPreferences.hook";
import { SystemAdminFavoritesProvider } from "./SystemAdminFavoritesProvider.component";
import { systemAdminMessages } from "./systemAdminLocale.messages";
import styles from "./SystemAdminShell.module.css";
import panelStyles from "./SystemAdminPanel.module.css";

/** Навигация, содержимое и права принадлежат host; shell владеет только общей компоновкой. */
export function SystemAdminShell({
  theme,
  locale = "ru",
  onThemeChange,
  brand,
  navigation,
  activeNavigationId,
  navigationPreferences,
  onNavigationPreferencesChange,
  secondaryNavigation,
  headerActions,
  toolbar,
  breadcrumbs,
  contentActions,
  backAction,
  children,
  footer,
}: SystemAdminShellProps) {
  const t = systemAdminMessages[locale];
  const mainId = useId();
  const { preferences, updatePreferences, toggleFavorite } =
    useNavigationPreferences({
      navigation,
      navigationPreferences,
      onNavigationPreferencesChange,
    });
  const { isMobile, navigationOpen, setNavigationOpen } =
    useSystemAdminNavigation();
  const brandContent = brand ?? (
    <span className={styles.brandMark} aria-label="Realize">
      r<span>•</span>
    </span>
  );
  return (
    <SystemAdminFavoritesProvider
      navigation={navigation}
      preferences={preferences}
      onToggle={toggleFavorite}
    >
      <Dialog.Root
        open={isMobile && navigationOpen}
        onOpenChange={setNavigationOpen}
      >
        <UiTheme
          mode={theme}
          baseline
          className={styles.shell}
          data-system-admin-shell
          lang={locale}
        >
          <a className={styles.skipLink} href={`#${mainId}`}>
            {t.skip}
          </a>
          {!isMobile && (
            <aside className={styles.rail} aria-label={t.systemPanel}>
              <div className={styles.brand}>{brandContent}</div>
              <div className={styles.railBody}>
                <SystemAdminNavigation
                  theme={theme}
                  navigation={navigation}
                  activeNavigationId={activeNavigationId}
                  navigationPreferences={preferences}
                  onNavigationPreferencesChange={updatePreferences}
                />
              </div>
            </aside>
          )}
          <header className={styles.header}>
            <Dialog.Trigger asChild>
              <UiButton
                variant="ghost"
                size="icon"
                className={styles.mobileTrigger}
                aria-label={t.openNavigation}
              >
                <Menu size={19} aria-hidden="true" />
              </UiButton>
            </Dialog.Trigger>
            {toolbar ?? (
              <div className={styles.headerActions}>
                {headerActions}
                <UiButton
                  variant="ghost"
                  size="icon"
                  className={styles.themeButton}
                  aria-label={theme === "dark" ? t.light : t.dark}
                  onClick={() =>
                    onThemeChange(theme === "dark" ? "light" : "dark")
                  }
                >
                  {theme === "dark" ? (
                    <Sun size={17} aria-hidden="true" />
                  ) : (
                    <Moon size={17} aria-hidden="true" />
                  )}
                </UiButton>
              </div>
            )}
          </header>
          <div className={styles.body} data-system-admin-body>
            {!isMobile && (
              <aside
                className={`${panelStyles.panel} ${styles.sidebar}`}
                aria-label={t.sectionNavigation}
                data-system-admin-sidebar
              >
                <div className={styles.sidebarContent} data-navigation-scroll>
                  {typeof secondaryNavigation === "function"
                    ? secondaryNavigation(() => undefined)
                    : secondaryNavigation}
                </div>
              </aside>
            )}
            <div className={styles.workspace}>
              <main id={mainId} className={styles.content} tabIndex={-1}>
                {(breadcrumbs || backAction || contentActions) && (
                  <div
                    className={styles.contentNavigation}
                    data-system-admin-content-navigation
                  >
                    <div className={styles.contextPath}>
                      {breadcrumbs && (
                        <div className={styles.breadcrumbs}>{breadcrumbs}</div>
                      )}
                      {backAction && (
                        <UiButton
                          variant="ghost"
                          size="icon"
                          className={styles.backButton}
                          aria-label={backAction.label ?? t.back}
                          title={backAction.label ?? t.back}
                          disabled={backAction.disabled}
                          onClick={backAction.onSelect}
                        >
                          <ArrowLeft size={17} aria-hidden="true" />
                        </UiButton>
                      )}
                    </div>
                    {contentActions && (
                      <div className={styles.contentActions}>
                        {contentActions}
                      </div>
                    )}
                  </div>
                )}
                {children}
              </main>
              {footer && <footer className={styles.footer}>{footer}</footer>}
            </div>
          </div>
        </UiTheme>
        {isMobile && (
          <Dialog.Portal>
            <UiTheme
              mode={theme}
              baseline
              className={styles.mobilePortal}
              lang={locale}
            >
              <Dialog.Overlay className={styles.mobileOverlay} />
              <Dialog.Content
                className={styles.mobilePanel}
                aria-describedby={undefined}
              >
                <div className={styles.mobileHeading}>
                  <Dialog.Title>{t.navigation}</Dialog.Title>
                  <Dialog.Close asChild>
                    <UiButton
                      variant="ghost"
                      size="icon"
                      aria-label={t.closeNavigation}
                    >
                      <X size={19} aria-hidden="true" />
                    </UiButton>
                  </Dialog.Close>
                </div>
                <SystemAdminNavigation
                  theme={theme}
                  mobile
                  navigation={navigation}
                  activeNavigationId={activeNavigationId}
                  navigationPreferences={preferences}
                  onNavigationPreferencesChange={updatePreferences}
                  onNavigate={() => setNavigationOpen(false)}
                />
              </Dialog.Content>
            </UiTheme>
          </Dialog.Portal>
        )}
      </Dialog.Root>
    </SystemAdminFavoritesProvider>
  );
}
