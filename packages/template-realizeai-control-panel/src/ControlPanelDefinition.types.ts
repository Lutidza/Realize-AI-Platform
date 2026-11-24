/**
 * @file packages/template-realizeai-control-panel/src/ControlPanelDefinition.types.ts
 * @version 2.0.0
 * @date 2026-11-17
 * @description Описывает связь объявленных макетов с его compiled реализацией.
 * @see documentation/specifications/realize-ai-control-panel-first-release.md
 */
import type { TemplateDefinition } from "@realize/template-contracts/react";
import type { ComponentType } from "react";
import type {
  LayoutDescriptor,
  LayoutVersionedRef,
} from "@realize/template-contracts";
import type {
  ControlPanelFrameProps,
  ControlPanelLayoutId,
} from "./layouts/ControlPanelLayout.types";

/** Описание макета связывает публичную идентичность с compiled реализацией. */
export type ControlPanelLayoutDefinition = {
  readonly id: ControlPanelLayoutId;
  readonly label: string;
  readonly target: "admin";
  readonly screen: "workspace";
  readonly reference: LayoutVersionedRef;
  readonly descriptor: LayoutDescriptor;
  readonly frameProps: Pick<ControlPanelFrameProps, "layoutId" | "hasTopbar">;
  readonly Component: ComponentType<ControlPanelFrameProps>;
};

/** Локальная definition первого среза; не подменяет будущий общий manifest-протокол макетов. */
export type ControlPanelDefinition = TemplateDefinition & {
  readonly defaultLayoutId: "default";
  readonly layouts: readonly ControlPanelLayoutDefinition[];
};
