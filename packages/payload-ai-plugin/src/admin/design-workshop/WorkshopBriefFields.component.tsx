/**
 * @file packages/payload-ai-plugin/src/admin/design-workshop/WorkshopBriefFields.component.tsx
 * @version 1.0.0
 * @date 2026-09-25
 * @description Редактирует общие поля брифа при создании и развитии проекта.
 * @see documentation/specifications/design-workshop.md
 */

"use client";
import { useId } from "react";
import { UiTextarea } from "@realize/ui-kit";
import type { DesignBrief } from "@realize/ai-contracts";
import type { WorkshopBriefProps } from "./DesignWorkshopClient.types";
import styles from "./Workshop.module.css";

export function WorkshopBriefFields({
  value,
  onChange,
  disabled,
}: WorkshopBriefProps) {
  const id = useId();
  const textField = (
    key: "goal" | "audience",
    label: string,
    placeholder: string,
    max: number,
  ) => (
    <label className={styles.field} htmlFor={id + key}>
      <span>
        {label} <span className={styles.required}>*</span>
      </span>
      <UiTextarea
        id={id + key}
        value={value[key]}
        required
        disabled={disabled}
        maxLength={max}
        rows={key === "goal" ? 3 : 2}
        placeholder={placeholder}
        onChange={(event) => onChange({ ...value, [key]: event.target.value })}
      />
    </label>
  );
  const lines = (
    key: Exclude<keyof DesignBrief, "goal" | "audience">,
    label: string,
    placeholder: string,
  ) => (
    <label className={styles.field} htmlFor={id + key}>
      <span>
        {label}
        {key === "acceptanceCriteria" && (
          <span className={styles.required}> *</span>
        )}
      </span>
      <UiTextarea
        id={id + key}
        value={value[key].join("\n")}
        rows={3}
        disabled={disabled}
        required={key === "acceptanceCriteria"}
        placeholder={placeholder}
        onChange={(event) =>
          onChange({
            ...value,
            [key]:
              event.target.value === "" ? [] : event.target.value.split("\n"),
          })
        }
      />
      <small>Каждый пункт — с новой строки.</small>
    </label>
  );
  return (
    <div className={styles.form}>
      {textField(
        "goal",
        "Что создаём",
        "Какую задачу должен решать дизайн?",
        4000,
      )}
      {textField(
        "audience",
        "Для кого",
        "Кто будет пользоваться интерфейсом?",
        2000,
      )}
      {lines(
        "acceptanceCriteria",
        "Критерии готовности",
        "Что должно получиться и как это проверить?",
      )}
      <details className={styles.details}>
        <summary>Экраны, состояния и ограничения</summary>
        <div className={styles.form}>
          {lines(
            "screens",
            "Экраны",
            "Например: список задач, карточка задачи",
          )}
          {lines(
            "states",
            "Состояния",
            "Например: пустой список, загрузка, ошибка",
          )}
          {lines(
            "constraints",
            "Ограничения",
            "Например: общие компоненты и токены текущей темы",
          )}
        </div>
      </details>
    </div>
  );
}
