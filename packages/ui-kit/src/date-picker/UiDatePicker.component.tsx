/**
 * @file packages/ui-kit/src/date-picker/UiDatePicker.component.tsx
 * @version 1.0.0
 * @date 2026-11-03
 * @description Собирает единый контрол даты или диапазона из общего календарного поля.
 * @see documentation/architecture/ui-kit.md
 */
"use client";
import type { UiDatePickerProps } from "./UiDatePicker.types";
import { UiDatePickerField } from "./UiDatePickerField.component";
import styles from "./UiDatePicker.module.css";

/** Не преобразует выбранные даты в бизнес-фильтры или UTC-границы. */
export function UiDatePicker(props: UiDatePickerProps) {
  if (props.mode !== "range")
    return (
      <div className={styles.root}>
        <UiDatePickerField {...props} />
      </div>
    );
  const {
    mode: _mode,
    label,
    value,
    onChange,
    startLabel = "С",
    endLabel = "По",
    ...field
  } = props;
  return (
    <fieldset className={styles.root} disabled={props.disabled}>
      <legend>{label}</legend>
      <div className={styles.range}>
        <UiDatePickerField
          {...field}
          label={startLabel}
          value={value[0]}
          startDate={value[0]}
          endDate={value[1]}
          selectsStart
          onChange={(date) => onChange([date, value[1]])}
        />
        <UiDatePickerField
          {...field}
          label={endLabel}
          value={value[1]}
          startDate={value[0]}
          endDate={value[1]}
          selectsEnd
          onChange={(date) => onChange([value[0], date])}
        />
      </div>
    </fieldset>
  );
}
