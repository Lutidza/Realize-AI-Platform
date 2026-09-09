/**
 * @file packages/payload-ai-plugin/src/admin/AdminUiTheme.component.tsx
 * @version 1.0.0
 * @date 2026-09-09
 * @description Связывает выбранную тему Payload с переносимым UI-китом Realize.
 */

"use client";

import { useTheme } from "@payloadcms/ui";
import { UiTheme } from "@realize/ui-kit";
import type { PropsWithChildren } from "react";

export const AdminUiTheme = ({ children }: PropsWithChildren) => {
  const { theme } = useTheme();
  return <UiTheme mode={theme}>{children}</UiTheme>;
};
