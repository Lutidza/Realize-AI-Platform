/**
 * @file packages/ui-kit/src/system-admin-shell/systemAdminNavigationPreferences.types.ts
 * @version 1.2.0
 * @date 2026-09-18
 * @description Определяет переносимые настройки порядка, видимости и избранных пунктов навигации.
 * @see documentation/architecture/system-admin-shell.md
 */

/** ID относятся к registry host; права доступа и маршруты настройка не меняет. */
export type SystemAdminNavigationPreferences = {
  order: string[];
  hidden: string[];
  /** Стабильные ID section:<id> и link:<id>; отсутствие поля совместимо с прежними снимками. */
  favorites?: string[];
  /** Персонально скрытые контейнеры host; каталог разделов не удаляет неизвестные ему ID. */
  hiddenItems?: string[];
};
