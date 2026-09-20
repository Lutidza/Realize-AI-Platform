/**
 * @file packages/ui-kit/src/system-admin-shell/SystemAdminMenuContent.component.tsx
 * @version 1.0.0
 * @date 2026-09-18
 * @description Соединяет анимацию, указатель и позиционирование выпадающих меню навигации.
 * @see documentation/architecture/system-admin-shell.md
 */
"use client";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { SystemAdminPopoverArrow } from "./SystemAdminPopoverArrow.component";
import type { SystemAdminMenuContentProps } from "./SystemAdminMenuContent.types";
import { useSystemAdminMenuContent } from "./useSystemAdminMenuContent.hook";
import styles from "./SystemAdminPopover.module.css";

export function SystemAdminMenuContent({
  className,
  children,
  ...props
}: SystemAdminMenuContentProps) {
  const { contentRef, onInteractOutside } = useSystemAdminMenuContent(props);
  return (
    <DropdownMenu.Content
      arrowPadding={20}
      sideOffset={6}
      collisionPadding={8}
      {...props}
      ref={contentRef}
      onInteractOutside={onInteractOutside}
      className={[styles.animated, className].filter(Boolean).join(" ")}
    >
      <SystemAdminPopoverArrow />
      {children}
    </DropdownMenu.Content>
  );
}
