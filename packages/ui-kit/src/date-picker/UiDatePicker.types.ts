/**
 * @file packages/ui-kit/src/date-picker/UiDatePicker.types.ts
 * @version 1.0.0
 * @date 2026-11-03
 * @description Задаёт общий контракт одиночной даты и диапазона без доменных правил.
 */
import type { Locale } from "date-fns";

export type UiDateInputDraft = {
  value: number | null;
  text: string;
  invalid: boolean;
};

export type UiDateRange = readonly [Date | null, Date | null];
export type UiDatePickerFieldProps = {
  label: string;
  value: Date | null;
  onChange: (value: Date | null) => void;
  withTime?: boolean;
  disabled?: boolean;
  required?: boolean;
  invalid?: boolean;
  describedBy?: string;
  minDate?: Date;
  maxDate?: Date;
  locale?: Locale;
  startDate?: Date | null;
  endDate?: Date | null;
  selectsStart?: boolean;
  selectsEnd?: boolean;
};

/** Date представляет локальный ввод; UTC/дни и границы API определяет consumer. */
export type UiDatePickerProps = Omit<
  UiDatePickerFieldProps,
  "value" | "onChange" | "startDate" | "endDate" | "selectsStart" | "selectsEnd"
> &
  (
    | {
        mode?: "single";
        value: Date | null;
        onChange: (value: Date | null) => void;
      }
    | {
        mode: "range";
        value: UiDateRange;
        onChange: (value: UiDateRange) => void;
        startLabel?: string;
        endLabel?: string;
      }
  );
