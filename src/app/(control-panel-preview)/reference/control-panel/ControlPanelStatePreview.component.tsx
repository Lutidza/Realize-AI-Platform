/**
 * @file src/app/(control-panel-preview)/reference/control-panel/ControlPanelStatePreview.component.tsx
 * @version 1.0.0
 * @date 2026-11-17
 * @description Предоставляет локальную форму preview для проверки сохранности состояния при смене макета.
 * @see documentation/specifications/realize-ai-control-panel-first-release.md
 */
"use client";
import { useId, useState } from "react";
import { UiButton, UiInput, UiSurface } from "@realize/ui-kit";
import styles from "./ControlPanelGridPreview.module.css";

/** Демоданные живут внутри content; переключение каркаса должно сохранять этот экземпляр. */
export function ControlPanelStatePreview() {
  const instanceId = useId();
  const [draft, setDraft] = useState("");
  const [count, setCount] = useState(0);
  return (
    <UiSurface
      className={styles.card}
      data-state-preview
      data-state-instance={instanceId}
    >
      <h2>Локальный черновик</h2>
      <p>
        Введите текст и смените макет через «Предпросмотр». Данные этой формы не
        сохраняются на сервере.
      </p>
      <label>
        Текст черновика
        <UiInput
          aria-label="Текст черновика"
          value={draft}
          onChange={(event) => setDraft(event.currentTarget.value)}
        />
      </label>
      <label>
        Временный ввод
        <UiInput aria-label="Временный ввод" defaultValue="" />
      </label>
      <label>
        Локальный файл
        <UiInput aria-label="Локальный файл" type="file" />
      </label>
      <UiButton
        type="button"
        variant="secondary"
        onClick={() => setCount((value) => value + 1)}
      >
        Отметки: {count}
      </UiButton>
    </UiSurface>
  );
}
