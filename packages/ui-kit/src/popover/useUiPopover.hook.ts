/**
 * @file packages/ui-kit/src/popover/useUiPopover.hook.ts
 * @version 1.0.1
 * @date 2026-11-12
 * @description Связывает позиционирование, dismiss и доступность общей панели.
 * @see documentation/architecture/ui-kit.md
 */
"use client";
import { useId, useState } from "react";
import type { ComponentPropsWithRef, CSSProperties } from "react";
import {
  arrow,
  autoUpdate,
  flip,
  offset,
  shift,
  size,
  useClick,
  useDismiss,
  useFloating,
  useInteractions,
  useRole,
} from "@floating-ui/react";
import type { UiPopoverProps } from "./UiPopover.types";
import { UI_FLOATING_GEOMETRY as geometry } from "../floating-layer/uiFloatingGeometry.constants";

/** transform:false сохраняет viewport-позиционирование вложенного Radix popup. */
export function useUiPopover({
  open,
  onOpenChange,
}: Pick<UiPopoverProps, "open" | "onOpenChange">) {
  const titleId = useId();
  const [arrowElement, setArrowElement] = useState<SVGSVGElement | null>(null);
  const { refs, floatingStyles, context, elements, middlewareData, placement } =
    useFloating({
      open,
      onOpenChange,
      placement: "bottom-end",
      strategy: "fixed",
      transform: false,
      middleware: [
        offset(geometry.arrowHeight + geometry.gap),
        flip({ padding: geometry.collisionPadding }),
        shift({ padding: geometry.collisionPadding }),
        size({
          padding: geometry.collisionPadding,
          apply({ availableHeight, elements }) {
            elements.floating.style.setProperty(
              "--ui-popover-available-height",
              `${Math.max(0, availableHeight - 2)}px`,
            );
          },
        }),
        arrow({ element: arrowElement, padding: geometry.arrowPadding }),
      ],
      whileElementsMounted: autoUpdate,
    });
  const click = useClick(context);
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: "dialog" });
  const { getReferenceProps, getFloatingProps } = useInteractions([
    click,
    dismiss,
    role,
  ]);
  const triggerProps = getReferenceProps({
    ref: refs.setReference,
  }) as ComponentPropsWithRef<"button">;
  const below = placement.startsWith("bottom");
  // Открытое основание перекрывает border поверхности; shift/flip сохраняют привязку к trigger.
  const arrowStyles: CSSProperties = {
    left: middlewareData.arrow?.x,
    [below ? "top" : "bottom"]: -geometry.arrowHeight,
    transform: below ? "rotate(180deg)" : undefined,
    visibility: middlewareData.arrow ? "visible" : "hidden",
  };
  return {
    setArrowElement,
    arrowStyles,
    titleId,
    setFloating: refs.setFloating,
    floatingStyles,
    context,
    floatingElement: elements.floating,
    triggerProps,
    floatingProps: getFloatingProps(),
  };
}
