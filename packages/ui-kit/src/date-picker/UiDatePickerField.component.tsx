/**
 * @file packages/ui-kit/src/date-picker/UiDatePickerField.component.tsx
 * @version 1.0.0
 * @date 2026-11-03
 * @description Адаптирует существующий календарь к Input, теме и доступности UI kit.
 * @see documentation/architecture/ui-kit.md
 */
"use client";
import { useId } from "react";
import DatePickerImport from "react-datepicker";
import { shift } from "@floating-ui/react";
import { ru } from "date-fns/locale/ru";
import { UiInput } from "../input/UiInput.component";
import { useUiDateInput } from "./useUiDateInput.hook";
import type { UiDatePickerFieldProps } from "./UiDatePicker.types";
import styles from "./UiDatePicker.module.css";

// Node/Vite и Next разрешают CJS default установленного движка по-разному.
const DatePicker = (
  "default" in DatePickerImport ? DatePickerImport.default : DatePickerImport
) as typeof DatePickerImport;

export function UiDatePickerField(props: UiDatePickerFieldProps) {
  const id = useId();
  const dateFormat = props.withTime ? "dd.MM.yyyy HH:mm" : "dd.MM.yyyy";
  const input = useUiDateInput(props, dateFormat);
  return (
    <div className={styles.field}>
      <label htmlFor={id}>{props.label}</label>
      <DatePicker
        id={id}
        selected={props.value}
        value={input.value}
        onChange={input.change}
        onSelect={input.clearValidation}
        onChangeRaw={input.changeRaw}
        customInput={<UiInput />}
        dateFormat={dateFormat}
        placeholderText={props.withTime ? "ДД.ММ.ГГГГ ЧЧ:ММ" : "ДД.ММ.ГГГГ"}
        locale={props.locale ?? ru}
        strictParsing
        autoComplete="off"
        preventOpenOnFocus
        disabled={props.disabled}
        required={props.required}
        ariaInvalid={String(Boolean(props.invalid || input.invalid))}
        ariaDescribedBy={props.describedBy}
        minDate={props.minDate}
        maxDate={props.maxDate}
        startDate={props.startDate}
        endDate={props.endDate}
        selectsStart={props.selectsStart}
        selectsEnd={props.selectsEnd}
        showTimeSelect={props.withTime}
        timeFormat="HH:mm"
        timeIntervals={15}
        timeCaption="Время"
        previousMonthButtonLabel="Предыдущий месяц"
        previousMonthAriaLabel="Предыдущий месяц"
        nextMonthButtonLabel="Следующий месяц"
        nextMonthAriaLabel="Следующий месяц"
        chooseDayAriaLabelPrefix="Выбрать"
        disabledDayAriaLabelPrefix="Недоступно"
        showPopperArrow={false}
        popperPlacement="bottom-start"
        popperModifiers={[shift({ padding: 8 })]}
        calendarClassName={styles.calendar}
        popperClassName={styles.popper}
        enableTabLoop={false}
      />
    </div>
  );
}
