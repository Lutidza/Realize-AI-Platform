/**
 * @file packages/template-realize/src/layouts/admin/useNavigationFlyout.hook.ts
 * @version 1.4.5
 * @date 2026-10-12
 * @description Согласует hover, клавиатуру и размещение бокового меню без смены текущего раздела.
 * @see documentation/architecture/system-admin-shell.md
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import type {
  NavigationFlyoutPosition,
  SystemAdminNavigationItem,
} from "./SystemAdminShell.types";
import {
  SYSTEM_NAVIGATION_MORE,
  SYSTEM_NAVIGATION_SETTINGS,
} from "./systemAdminNavigation.constants";

/** Закреплённая desktop-панель меняет содержимое при hover и закрывается только явно. */
export function useNavigationFlyout(
  mobile: boolean,
  navigation: SystemAdminNavigationItem[],
  visibleNavigation: SystemAdminNavigationItem[],
  activeNavigationId: string,
) {
  // Значения, а не identity host-массивов: render после измерения не перезапускает эффект.
  const registryKey = JSON.stringify(navigation.map((item) => item.id));
  const visibleKey = JSON.stringify(visibleNavigation.map((item) => item.id));
  const [requestedOpenId, setOpenId] = useState<string | null>(null);
  const [isPinned, setIsPinned] = useState(false);
  const registryIds = navigation.map((item) => item.id);
  const fallbackId = registryIds.includes(activeNavigationId)
    ? activeNavigationId
    : (visibleNavigation.find((item) => registryIds.includes(item.id))?.id ??
      navigation[0]?.id ??
      SYSTEM_NAVIGATION_MORE);
  const requestedIdIsValid = Boolean(
    requestedOpenId &&
    (registryIds.includes(requestedOpenId) ||
      requestedOpenId === SYSTEM_NAVIGATION_MORE ||
      requestedOpenId === SYSTEM_NAVIGATION_SETTINGS),
  );
  // Fallback вычисляется до render Content: удаление раздела не закрывает закреплённую рамку.
  const openId = isPinned && !requestedIdIsValid ? fallbackId : requestedOpenId;
  const [position, setPosition] = useState<NavigationFlyoutPosition>({
    left: 80,
    top: 8,
    height: 600,
    maxHeight: 600,
    arrowTop: 24,
  });
  const rootRef = useRef<HTMLElement>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const openedIdRef = useRef<string | null>(null);
  const pinnedRef = useRef(false);
  const contentIdRef = useRef<string | null>(null);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusRequested = useRef(false);
  const suppressFocus = useRef(false);
  const returnFocusRef = useRef<HTMLButtonElement | null>(null);
  const clearTimers = useCallback(() => {
    if (openTimer.current) clearTimeout(openTimer.current);
    if (closeTimer.current) clearTimeout(closeTimer.current);
    openTimer.current = null;
    closeTimer.current = null;
  }, []);
  const close = useCallback(
    (restoreFocus = false) => {
      clearTimers();
      pinnedRef.current = false;
      setIsPinned(false);
      setOpenId(null);
      openedIdRef.current = null;
      contentIdRef.current = null;
      focusRequested.current = false;
      if (restoreFocus && triggerRef.current?.isConnected) {
        if (mobile) {
          // Мобильный список становится доступным лишь после render закрытой панели.
          returnFocusRef.current = triggerRef.current;
          return;
        }
        suppressFocus.current = true;
        triggerRef.current.focus({ preventScroll: true });
        suppressFocus.current = false;
      }
    },
    [clearTimers, mobile],
  );
  useEffect(() => {
    if (openId || !returnFocusRef.current) return;
    const trigger = returnFocusRef.current;
    returnFocusRef.current = null;
    if (trigger.isConnected) trigger.focus({ preventScroll: true });
  }, [openId]);
  const updatePosition = useCallback(() => {
    if (mobile || !triggerRef.current || !rootRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const frame = rootRef.current.getBoundingClientRect();
    const sidebar = rootRef.current
      .closest("[data-system-admin-shell]")
      ?.querySelector<HTMLElement>("[data-system-admin-sidebar]");
    const frameTop = Math.max(0, frame.top);
    const maxHeight = Math.max(
      0,
      Math.min(window.innerHeight, frame.bottom) - frameTop,
    );
    // Закрепление влияет на закрытие панели, сохраняя геометрию её содержимого.
    const compact = openedIdRef.current === SYSTEM_NAVIGATION_MORE;
    const naturalHeight =
      panelRef.current?.dataset.compact === "true"
        ? panelRef.current.getBoundingClientRect().height
        : 240;
    const height = compact ? Math.min(naturalHeight, maxHeight) : maxHeight;
    const top = compact
      ? Math.max(frameTop, Math.min(rect.top, frameTop + maxHeight - height))
      : frameTop;
    const arrowInset = Math.min(20, height / 2);
    setPosition({
      // В общей оболочке flyout точно перекрывает внутреннюю панель; standalone привязывается к rail.
      left: sidebar?.getBoundingClientRect().left ?? frame.right + 6,
      top,
      height: compact ? undefined : height,
      maxHeight,
      arrowTop: Math.min(
        height - arrowInset,
        Math.max(arrowInset, rect.top + rect.height / 2 - top),
      ),
    });
  }, [mobile]);
  const setPanelRef = useCallback(
    (node: HTMLDivElement | null) => {
      panelRef.current = node;
      if (node) updatePosition();
    },
    [updatePosition],
  );
  const focusPanel = useCallback(() => {
    const heading = panelRef.current?.querySelector<HTMLElement>(
      "[data-navigation-heading]",
    );
    heading?.focus({ preventScroll: true });
    if (mobile) heading?.scrollIntoView({ block: "nearest" });
  }, [mobile]);
  const open = useCallback(
    (id: string, trigger: HTMLButtonElement, focus = false) => {
      clearTimers();
      returnFocusRef.current = null;
      triggerRef.current = trigger;
      openedIdRef.current = id;
      focusRequested.current = focus;
      updatePosition();
      setOpenId(id);
      if (focus && openId === id) {
        focusRequested.current = false;
        focusPanel();
      }
    },
    [clearTimers, focusPanel, openId, updatePosition],
  );
  const togglePinned = (button: HTMLButtonElement) => {
    if (mobile) return;
    if (pinnedRef.current) {
      close();
      button.focus({ preventScroll: true });
      return;
    }
    clearTimers();
    pinnedRef.current = true;
    setIsPinned(true);
    const selectedId = requestedIdIsValid && openId ? openId : fallbackId;
    const anchorId = visibleNavigation.some((item) => item.id === selectedId)
      ? selectedId
      : SYSTEM_NAVIGATION_MORE;
    const trigger = Array.from(
      rootRef.current?.querySelectorAll<HTMLButtonElement>(
        "[data-navigation-trigger]",
      ) ?? [],
    ).find((node) => node.dataset.navigationTrigger === anchorId);
    open(selectedId, trigger ?? button, true);
  };
  useEffect(() => {
    if (!openId) return;
    const frame = requestAnimationFrame(() => {
      const registryIds: string[] = JSON.parse(registryKey);
      const visibleIds: string[] = JSON.parse(visibleKey);
      const systemPanel =
        openId === SYSTEM_NAVIGATION_MORE ||
        openId === SYSTEM_NAVIGATION_SETTINGS;
      const triggers = Array.from(
        rootRef.current?.querySelectorAll<HTMLButtonElement>(
          "[data-navigation-trigger]",
        ) ?? [],
      );
      const anchorId =
        systemPanel || !visibleIds.includes(openId)
          ? SYSTEM_NAVIGATION_MORE
          : openId;
      triggerRef.current =
        triggers.find((node) => node.dataset.navigationTrigger === anchorId) ??
        null;
      if (!systemPanel && !registryIds.includes(openId)) {
        // Удалённый registry-пункт не должен ожить при последующем обновлении каталога.
        close(
          document.activeElement === document.body ||
            Boolean(panelRef.current?.contains(document.activeElement)),
        );
        return;
      }
      openedIdRef.current = openId;
      if (isPinned && requestedOpenId !== openId) setOpenId(openId);
      if (contentIdRef.current !== openId) {
        const body = panelRef.current?.querySelector<HTMLElement>(
          "[data-navigation-body]",
        );
        if (body) body.scrollTop = 0;
        contentIdRef.current = openId;
      }
      updatePosition();
      if (focusRequested.current) {
        focusRequested.current = false;
        focusPanel();
      }
    });
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(updatePosition);
    if (rootRef.current) observer?.observe(rootRef.current);
    if (panelRef.current) observer?.observe(panelRef.current);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, [
    openId,
    requestedOpenId,
    isPinned,
    registryKey,
    visibleKey,
    close,
    focusPanel,
    updatePosition,
  ]);
  // Переход из сетки не привязывается к её исчезающей кнопке: якорь остаётся в rail.
  const openFromRail = (id: string, anchorId: string) => {
    const trigger = Array.from(
      rootRef.current?.querySelectorAll<HTMLButtonElement>(
        "[data-navigation-trigger]",
      ) ?? [],
    ).find((node) => node.dataset.navigationTrigger === anchorId);
    if (trigger) open(id, trigger, true);
  };
  useEffect(() => {
    if (!openId) return;
    const outside = (event: PointerEvent) => {
      // На touch внешним закрытием владеет drawer, раздел меняется только явно.
      if (mobile || pinnedRef.current) return;
      if (!(event.target instanceof Node)) return;
      if (
        !rootRef.current?.contains(event.target) &&
        !panelRef.current?.contains(event.target)
      )
        close();
    };
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape" || !(event.target instanceof Node)) return;
      // Первый Escape принадлежит вложенному меню, а не всей панели.
      if (
        panelRef.current?.querySelector(
          '[data-navigation-item-menu][data-state="open"]',
        )
      )
        return;
      if (
        !rootRef.current?.contains(event.target) &&
        !panelRef.current?.contains(event.target)
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      close(true);
    };
    const resize = () => updatePosition();
    document.addEventListener("pointerdown", outside);
    window.addEventListener("keydown", escape, true);
    window.addEventListener("resize", resize);
    return () => {
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("keydown", escape, true);
      window.removeEventListener("resize", resize);
    };
  }, [openId, close, updatePosition, mobile]);
  useEffect(() => clearTimers, [clearTimers]);
  const scheduleOpen = (id: string, trigger: HTMLButtonElement) => {
    if (mobile) return;
    clearTimers();
    if (pinnedRef.current) {
      open(id, trigger);
      return;
    }
    openTimer.current = setTimeout(() => open(id, trigger), 120);
  };
  const scheduleClose = () => {
    if (mobile || pinnedRef.current) return;
    clearTimers();
    closeTimer.current = setTimeout(() => {
      if (
        !pinnedRef.current &&
        !panelRef.current?.contains(document.activeElement)
      )
        close();
    }, 240);
  };
  const onNavigationScroll = () => {
    if (mobile || !openId || !triggerRef.current) return;
    const trigger = triggerRef.current.getBoundingClientRect();
    const list = triggerRef.current.parentElement?.getBoundingClientRect();
    if (
      !pinnedRef.current &&
      list &&
      (trigger.bottom <= list.top || trigger.top >= list.bottom)
    )
      close();
    else updatePosition();
  };
  const onTriggerFocus = (id: string, trigger: HTMLButtonElement) => {
    if (!mobile && !suppressFocus.current) open(id, trigger);
  };
  const onTriggerKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    id: string,
  ) => {
    if (["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const triggers = Array.from(
        rootRef.current?.querySelectorAll<HTMLButtonElement>(
          "[data-navigation-trigger]",
        ) ?? [],
      );
      const index = triggers.indexOf(event.currentTarget);
      const next =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? triggers.length - 1
            : (index + (event.key === "ArrowDown" ? 1 : -1) + triggers.length) %
              triggers.length;
      triggers[next]?.focus();
      return;
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      open(id, event.currentTarget, true);
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      close(true);
    }
  };
  return {
    openId,
    isPinned,
    togglePinned,
    position,
    rootRef,
    panelRef,
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
  };
}
