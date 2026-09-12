/**
 * @file packages/payload-ai-plugin/src/admin/workflow-runs/WorkflowRunFilterOption.component.tsx
 * @version 1.0.0
 * @date 2026-09-11
 * @description Показывает доступный с клавиатуры поиск исторического профиля или процесса.
 */

"use client";

import { useRef, useState } from "react";
import { UiButton, UiInput, UiNotice } from "@realize/ui-kit";
import { ChevronDown, ChevronLeft, ChevronRight, Check } from "lucide-react";
import type { WorkflowRunFilterOptionProps } from "./WorkflowRuns.types";
import { useWorkflowRunOptions } from "./useWorkflowRunOptions.hook";
import styles from "./WorkflowRuns.module.css";

export const WorkflowRunFilterOption = ({
  kind,
  value,
  onChange,
}: WorkflowRunFilterOptionProps) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [chosen, setChosen] = useState<{ key: string; title: string }>();
  const container = useRef<HTMLDetailsElement>(null);
  const { data, error, loading, refresh } = useWorkflowRunOptions(
    kind,
    open,
    query,
    page,
  );
  const label = kind === "workflow" ? "Процесс" : "Профиль";
  const selected =
    chosen?.key === value
      ? chosen
      : data?.items.find((item) => item.key === value);
  const choose = (item?: { key: string; title: string }) => {
    setChosen(item);
    onChange(item?.key ?? "");
    if (container.current) {
      container.current.open = false;
      container.current.querySelector("summary")?.focus();
    }
  };
  return (
    <div className={styles.field}>
      <span>{label}</span>
      <details
        className={styles.optionPicker}
        ref={container}
        onKeyDown={(event) => {
          if (event.key === "Escape" && container.current?.open) {
            event.preventDefault();
            container.current.open = false;
            container.current.querySelector("summary")?.focus();
          }
        }}
        onToggle={(event) => setOpen(event.currentTarget.open)}
      >
        <summary aria-label={`Фильтр: ${label}`}>
          <span>
            {value
              ? (selected?.title ?? value)
              : `Все ${kind === "workflow" ? "процессы" : "профили"}`}
          </span>
          <ChevronDown size={14} aria-hidden="true" />
        </summary>
        <div className={styles.optionPanel} aria-busy={loading}>
          <UiInput
            aria-label={`Поиск: ${label}`}
            placeholder="Название или ключ"
            value={query}
            maxLength={200}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
          />
          <UiButton variant="ghost" size="small" onClick={() => choose()}>
            Все {kind === "workflow" ? "процессы" : "профили"}
          </UiButton>
          {error ? (
            <UiNotice tone="danger" role="alert">
              {error}
              <UiButton variant="ghost" size="small" onClick={refresh}>
                Повторить
              </UiButton>
            </UiNotice>
          ) : null}
          <div className={styles.optionList}>
            {data?.items.map((item) => (
              <UiButton
                key={item.key}
                variant="ghost"
                size="small"
                className={styles.option}
                disabled={loading}
                aria-pressed={item.key === value}
                onClick={() => choose(item)}
              >
                <span>
                  <strong>{item.title}</strong>
                  <small>{item.key}</small>
                </span>
                {item.key === value ? (
                  <Check size={14} aria-hidden="true" />
                ) : null}
              </UiButton>
            ))}
            {!loading && data?.items.length === 0 ? (
              <p className={styles.muted}>Совпадений нет.</p>
            ) : null}
          </div>
          <div className={styles.inline}>
            <UiButton
              size="icon"
              variant="ghost"
              aria-label={`Предыдущая страница вариантов: ${label}`}
              disabled={loading || page <= 1}
              onClick={() => setPage(page - 1)}
            >
              <ChevronLeft size={16} />
            </UiButton>
            <span className={styles.muted}>
              {loading
                ? "Загрузка…"
                : `${data?.page ?? page} / ${Math.max(1, data?.totalPages ?? 1)}`}
            </span>
            <UiButton
              size="icon"
              variant="ghost"
              aria-label={`Следующая страница вариантов: ${label}`}
              disabled={loading || page >= (data?.totalPages ?? 1)}
              onClick={() => setPage(page + 1)}
            >
              <ChevronRight size={16} />
            </UiButton>
          </div>
        </div>
      </details>
    </div>
  );
};
