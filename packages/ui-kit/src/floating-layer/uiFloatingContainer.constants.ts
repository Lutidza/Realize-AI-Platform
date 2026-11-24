/**
 * @file packages/ui-kit/src/floating-layer/uiFloatingContainer.constants.ts
 * @version 1.0.0
 * @date 2026-11-11
 * @description Передаёт вложенным popup контейнер текущего floating-слоя.
 * @see documentation/architecture/ui-kit.md
 */
"use client";
import { createContext } from "react";

/** Локальный контейнер удерживает вложенные portals внутри dismiss/focus границы родителя. */
export const UI_FLOATING_CONTAINER_CONTEXT = createContext<HTMLElement | null>(
  null,
);
