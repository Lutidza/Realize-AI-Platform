/**
 * @file packages/ui-kit/src/template-runtime/uiTemplateRuntime.constants.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Создаёт единый React context adapter и оформления для обычного DOM и portals.
 */
"use client";
import { createContext } from "react";
import type { UiTemplateRuntime } from "./UiTemplateRuntime.types";

export const UI_TEMPLATE_RUNTIME_CONTEXT =
  createContext<UiTemplateRuntime | null>(null);
