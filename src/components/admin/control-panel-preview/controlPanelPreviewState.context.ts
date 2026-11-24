/**
 * @file src/components/admin/control-panel-preview/controlPanelPreviewState.context.ts
 * @version 1.0.0
 * @date 2026-11-22
 * @description Передаёт потребителям текущие параметры URL предпросмотра.
 * @see documentation/specifications/realize-ai-control-panel-first-release.md
 */
"use client";

import { createContext } from "react";
import type { ControlPanelPreviewState } from "./ControlPanelPreview.types";

/** Отсутствующий layoutId сохраняет наследование, даже когда renderer уже выбрал макет. */
export const controlPanelPreviewStateContext =
  createContext<ControlPanelPreviewState | null>(null);
