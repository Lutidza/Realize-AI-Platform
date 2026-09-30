/**
 * @file src/components/admin/design-workshop/DesignWorkshopHost.types.ts
 * @version 1.0.0
 * @date 2026-09-25
 * @description Определяет безопасные входные параметры host Мастерской.
 * @see documentation/specifications/design-workshop.md
 */

export type DesignWorkshopHostProps = {
  initialTheme: "light" | "dark";
  projectId?: string;
};
