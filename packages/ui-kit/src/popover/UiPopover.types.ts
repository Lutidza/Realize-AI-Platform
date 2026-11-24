/**
 * @file packages/ui-kit/src/popover/UiPopover.types.ts
 * @version 1.0.0
 * @date 2026-11-11
 * @description Определяет управляемую немодальную панель с общим trigger-контрактом.
 * @see documentation/architecture/ui-kit.md
 */
import type { ComponentPropsWithRef, ReactNode } from "react";
import type { TemplateMode } from "@realize/template-contracts";

export type UiPopoverProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: TemplateMode;
  title: string;
  children: ReactNode;
  renderTrigger: (props: ComponentPropsWithRef<"button">) => ReactNode;
};
