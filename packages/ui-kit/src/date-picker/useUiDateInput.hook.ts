/**
 * @file packages/ui-kit/src/date-picker/useUiDateInput.hook.ts
 * @version 1.0.0
 * @date 2026-11-03
 * @description Не допускает отправку формы со старой датой при неверном ручном вводе.
 */
"use client";
import { useEffect, useRef, useState } from "react";
import { format, isValid, parse, startOfDay } from "date-fns";
import type { DatePickerProps } from "react-datepicker";
import type {
  UiDateInputDraft,
  UiDatePickerFieldProps,
} from "./UiDatePicker.types";

export function useUiDateInput(
  props: UiDatePickerFieldProps,
  dateFormat: string,
) {
  const input = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<UiDateInputDraft>();
  const valueKey = props.value?.getTime() ?? null;
  const currentDraft = draft?.value === valueKey ? draft : undefined;
  // Внешняя смена значения сбрасывает native validity; текст старого черновика не переносится.
  useEffect(() => {
    input.current?.setCustomValidity("");
  }, [valueKey]);
  const changeRaw: DatePickerProps["onChangeRaw"] = (event) => {
    if (!(event?.target instanceof HTMLInputElement)) return;
    input.current = event.target;
    const value = event.target.value;
    const parsed = parse(value, dateFormat, new Date(), {
      locale: props.locale,
    });
    const valid =
      !value ||
      (isValid(parsed) &&
        format(parsed, dateFormat) === value &&
        (!props.minDate || startOfDay(parsed) >= startOfDay(props.minDate)) &&
        (!props.maxDate || startOfDay(parsed) <= startOfDay(props.maxDate)));
    setDraft({ value: valueKey, text: value, invalid: !valid });
    event.target.setCustomValidity(
      valid
        ? ""
        : `Введите допустимую дату в формате ${props.withTime ? "ДД.ММ.ГГГГ ЧЧ:ММ" : "ДД.ММ.ГГГГ"}.`,
    );
  };
  const clearValidation = () => {
    input.current?.setCustomValidity("");
    setDraft(undefined);
  };
  return {
    invalid: currentDraft?.invalid ?? false,
    // Движок очищает raw text при Escape; controlled draft сохраняет неверный ввод для исправления.
    value: currentDraft?.text,
    changeRaw,
    clearValidation,
    change: (value: Date | null) => {
      clearValidation();
      props.onChange(value);
    },
  };
}
