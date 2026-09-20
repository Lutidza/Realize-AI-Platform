/**
 * @file packages/ui-kit/src/system-admin-shell/SystemAdminNavigation.component.tsx
 * @version 2.4.3
 * @date 2026-09-18
 * @description Собирает глобальные разделы, меню «Ещё» и персональную настройку навигации.
 * @see documentation/architecture/system-admin-shell.md
 */

"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { ChevronRight, Grip, Settings2 } from "lucide-react";
import { useId } from "react";
import { UiButton } from "../button/UiButton.component";
import { UiTheme } from "../theme/UiTheme.component";
import { SystemAdminFlyout } from "./SystemAdminFlyout.component";
import { SystemAdminNavigationMore } from "./SystemAdminNavigationMore.component";
import { SystemAdminNavigationSettings } from "./SystemAdminNavigationSettings.component";
import type {
  SystemAdminNavigationItem,
  SystemAdminNavigationProps,
} from "./SystemAdminShell.types";
import {
  SYSTEM_NAVIGATION_MORE,
  SYSTEM_NAVIGATION_SETTINGS,
} from "./systemAdminNavigation.constants";
import { useNavigationFlyout } from "./useNavigationFlyout.hook";
import { useNavigationPreferences } from "./useNavigationPreferences.hook";
import { SystemAdminFavoritesProvider } from "./SystemAdminFavoritesProvider.component";
import { SystemAdminPopoverArrow } from "./SystemAdminPopoverArrow.component";
import { SystemAdminDisclosureIcon } from "./SystemAdminDisclosureIcon.component";
import styles from "./SystemAdminNavigation.module.css";
import panelStyles from "./SystemAdminPanel.module.css";

/** Registry и сохранение принадлежат host; hover не выполняет команду раздела. */
export function SystemAdminNavigation({
  navigation,
  activeNavigationId,
  navigationPreferences,
  onNavigationPreferencesChange,
  onNavigate,
  mobile = false,
  theme,
}: SystemAdminNavigationProps) {
  const id = useId();
  const {
    preferences,
    items,
    visibleItems,
    hiddenItems,
    updatePreferences,
    showItem,
    resetPreferences,
    toggleFavorite,
  } = useNavigationPreferences({
    navigation,
    navigationPreferences,
    onNavigationPreferencesChange,
  });
  const {
    openId,
    isPinned,
    togglePinned,
    position,
    rootRef,
    setPanelRef,
    open,
    openFromRail,
    close,
    clearTimers,
    scheduleOpen,
    scheduleClose,
    onNavigationScroll,
    onTriggerFocus,
    onTriggerKeyDown,
  } = useNavigationFlyout(mobile, items, visibleItems, activeNavigationId);
  const moreItem: SystemAdminNavigationItem = {
    id: SYSTEM_NAVIGATION_MORE,
    label: "Ещё",
    icon: <Grip size={22} strokeWidth={1.75} />,
    description: "Выберите раздел для основной панели.",
    panel: (
      <SystemAdminNavigationMore
        items={hiddenItems}
        activeNavigationId={activeNavigationId}
        onSelect={(selectedId) => {
          showItem(selectedId);
          openFromRail(selectedId, SYSTEM_NAVIGATION_MORE);
        }}
        onCustomize={() =>
          openFromRail(SYSTEM_NAVIGATION_SETTINGS, SYSTEM_NAVIGATION_MORE)
        }
      />
    ),
  };
  const settingsItem: SystemAdminNavigationItem = {
    id: SYSTEM_NAVIGATION_SETTINGS,
    label: "Настройка навигации",
    icon: <Settings2 size={22} strokeWidth={1.75} />,
    description:
      "Выберите видимые разделы и удобный порядок. Изменения применяются сразу.",
    panel: (
      <SystemAdminNavigationSettings
        items={items}
        preferences={preferences}
        onChange={updatePreferences}
        onReset={resetPreferences}
        onDone={() =>
          openFromRail(SYSTEM_NAVIGATION_MORE, SYSTEM_NAVIGATION_MORE)
        }
      />
    ),
  };
  const showingMore = openId === SYSTEM_NAVIGATION_MORE;
  const compact = showingMore;
  const customizing = openId === SYSTEM_NAVIGATION_SETTINGS;
  const item = showingMore
    ? moreItem
    : customizing
      ? settingsItem
      : navigation.find((entry) => entry.id === openId);
  const activeHidden = hiddenItems.some(
    (entry) => entry.id === activeNavigationId,
  );
  const moreExpanded = Boolean(
    item &&
    (showingMore ||
      customizing ||
      hiddenItems.some((entry) => entry.id === openId)),
  );
  const content = item && (
    <SystemAdminFlyout
      item={item}
      id={id}
      mobile={mobile}
      onClose={() => close(true)}
      onOpenSection={(sectionId) =>
        openFromRail(
          sectionId,
          visibleItems.some((entry) => entry.id === sectionId)
            ? sectionId
            : SYSTEM_NAVIGATION_MORE,
        )
      }
      onNavigate={() => {
        if (!isPinned) close(true);
        onNavigate?.();
      }}
    />
  );
  const renderTrigger = (entry: SystemAdminNavigationItem) => {
    const isMore = entry.id === SYSTEM_NAVIGATION_MORE;
    const expanded = isMore ? moreExpanded : entry.id === item?.id;
    return (
      <UiButton
        key={entry.id}
        variant="ghost"
        className={styles.module}
        aria-label={entry.label}
        aria-current={
          (isMore ? activeHidden : entry.id === activeNavigationId)
            ? "page"
            : undefined
        }
        aria-expanded={expanded}
        aria-controls={expanded ? id : undefined}
        aria-haspopup={mobile ? undefined : "dialog"}
        data-open={expanded}
        data-navigation-trigger={entry.id}
        onPointerEnter={(event) => {
          if (event.pointerType !== "touch")
            scheduleOpen(entry.id, event.currentTarget);
        }}
        onPointerLeave={scheduleClose}
        onFocus={(event) => onTriggerFocus(entry.id, event.currentTarget)}
        onKeyDown={(event) => onTriggerKeyDown(event, entry.id)}
        onClick={(event) => open(entry.id, event.currentTarget, true)}
      >
        <span aria-hidden="true" className={styles.moduleIcon}>
          {entry.icon}
        </span>
        {mobile && (
          <>
            <span className={styles.moduleLabel}>{entry.label}</span>
            <ChevronRight size={18} aria-hidden="true" />
          </>
        )}
      </UiButton>
    );
  };
  return (
    <SystemAdminFavoritesProvider
      navigation={navigation}
      preferences={preferences}
      onToggle={toggleFavorite}
    >
      <Dialog.Root
        open={!mobile && Boolean(item)}
        modal={false}
        onOpenChange={(isOpen) => {
          if (!isOpen && !isPinned) close();
        }}
      >
        <nav
          ref={rootRef}
          aria-label="Разделы системы"
          className={styles.navigation}
          data-mobile={mobile}
        >
          <div
            className={styles.modules}
            onScroll={onNavigationScroll}
            hidden={mobile && Boolean(item)}
            data-navigation-list={mobile ? "" : undefined}
          >
            {visibleItems.map(renderTrigger)}
            <div
              role="separator"
              aria-orientation="horizontal"
              className={styles.moduleDivider}
            />
            {renderTrigger(moreItem)}
          </div>
          {!mobile && (
            <div className={styles.panelToggleFooter}>
              <UiButton
                variant="ghost"
                className={styles.module}
                aria-label={isPinned ? "Свернуть меню" : "Раскрыть меню"}
                title={isPinned ? "Свернуть меню" : "Раскрыть меню"}
                aria-expanded={isPinned}
                aria-controls={isPinned ? id : undefined}
                data-navigation-pin-toggle
                data-pinned={isPinned}
                data-open={isPinned}
                onClick={(event) => togglePinned(event.currentTarget)}
              >
                <span aria-hidden="true" className={styles.moduleIcon}>
                  <SystemAdminDisclosureIcon
                    direction="right"
                    doubled
                    expanded={isPinned}
                    size={22}
                  />
                </span>
              </UiButton>
            </div>
          )}
          {mobile && item && (
            <div
              id={id}
              ref={setPanelRef}
              role="region"
              aria-labelledby={`${id}-title`}
              data-inline="true"
              data-compact={compact}
              data-customizing={customizing}
              className={`${panelStyles.panel} ${styles.flyout}`}
            >
              {content}
            </div>
          )}
        </nav>
        {!mobile && (
          <Dialog.Portal>
            <UiTheme mode={theme} baseline className={styles.popupPortal}>
              <Dialog.Content
                id={id}
                ref={setPanelRef}
                className={`${panelStyles.panel} ${styles.flyout}`}
                data-compact={compact}
                data-pinned={isPinned}
                data-customizing={customizing}
                style={{
                  left: position.left,
                  top: position.top,
                  height: position.height,
                  maxHeight: position.maxHeight,
                }}
                onOpenAutoFocus={(event) => event.preventDefault()}
                onCloseAutoFocus={(event) => event.preventDefault()}
                onEscapeKeyDown={(event) => {
                  event.preventDefault();
                  close(true);
                }}
                onInteractOutside={(event) => {
                  if (
                    isPinned ||
                    (event.target instanceof Node &&
                      rootRef.current?.contains(event.target))
                  )
                    event.preventDefault();
                }}
                onPointerEnter={clearTimers}
                onPointerLeave={scheduleClose}
              >
                <SystemAdminPopoverArrow
                  inline
                  className={styles.arrow}
                  style={{ top: position.arrowTop }}
                />
                {content}
              </Dialog.Content>
            </UiTheme>
          </Dialog.Portal>
        )}
      </Dialog.Root>
    </SystemAdminFavoritesProvider>
  );
}
