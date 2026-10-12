/**
 * @file packages/template-realize/src/primitives/realizeTemplateUi.config.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Собирает единственный compiled UI adapter примитивов Realize.
 * @see documentation/architecture/ui-kit.md
 */
import type { TemplateUiAdapter } from "@realize/template-contracts/react";
import { RealizeButton } from "./RealizeButton.component";
import { RealizeInput } from "./RealizeInput.component";

/** Adapter не импортирует dispatch UiButton/UiInput и не образует рекурсивный lookup. */
export const realizeTemplateUi: TemplateUiAdapter = {
  Button: RealizeButton,
  Input: RealizeInput,
};
