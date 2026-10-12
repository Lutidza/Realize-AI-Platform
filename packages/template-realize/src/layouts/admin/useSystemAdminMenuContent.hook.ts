/**
 * @file packages/template-realize/src/layouts/admin/useSystemAdminMenuContent.hook.ts
 * @version 1.0.1
 * @date 2026-10-12
 * @description Не позволяет закрывающемуся слою повторно обработать клик своего переключателя.
 * @see documentation/architecture/system-admin-shell.md
 */
import { useRef } from "react";
import type { SystemAdminMenuContentProps } from "./SystemAdminMenuContent.types";

export function useSystemAdminMenuContent(props: SystemAdminMenuContentProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const onInteractOutside: NonNullable<
    SystemAdminMenuContentProps["onInteractOutside"]
  > = (event) => {
    props.onInteractOutside?.(event);
    const triggerId = contentRef.current?.getAttribute("aria-labelledby");
    const trigger = triggerId ? document.getElementById(triggerId) : null;
    // Trigger сам меняет open. Выходящая анимация ещё удерживает DismissableLayer.
    if (
      !event.defaultPrevented &&
      event.target instanceof Node &&
      trigger?.contains(event.target)
    )
      event.preventDefault();
  };
  return { contentRef, onInteractOutside };
}
