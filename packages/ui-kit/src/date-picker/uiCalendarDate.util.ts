/**
 * @file packages/ui-kit/src/date-picker/uiCalendarDate.util.ts
 * @version 1.0.0
 * @date 2026-11-03
 * @description Преобразует календарную дату без UTC-сдвига через существующий date-fns.
 */
import { format, isValid, parse } from "date-fns";

/** YYYY-MM-DD — календарный день, а не timestamp; пустой/неверный ввод даёт null. */
export function parseUiCalendarDate(value: string): Date | null {
  const date = parse(value, "yyyy-MM-dd", new Date(2000, 0, 1));
  return isValid(date) && format(date, "yyyy-MM-dd") === value ? date : null;
}

/** Сохраняет день, выбранный в календаре, независимо от часового пояса браузера. */
export function formatUiCalendarDate(value: Date | null): string {
  return value ? format(value, "yyyy-MM-dd") : "";
}
