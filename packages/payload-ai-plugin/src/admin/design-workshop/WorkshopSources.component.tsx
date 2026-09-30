/**
 * @file packages/payload-ai-plugin/src/admin/design-workshop/WorkshopSources.component.tsx
 * @version 1.0.0
 * @date 2026-09-25
 * @description Редактирует ссылки и заметки внутри несохранённого снимка проекта.
 * @see documentation/specifications/design-workshop.md
 */

"use client";
import { Plus, Trash2 } from "lucide-react";
import { UiButton, UiInput, UiTextarea } from "@realize/ui-kit";
import type { DesignSource } from "@realize/ai-contracts";
import type { WorkshopSnapshotProps } from "./DesignWorkshopClient.types";
import styles from "./Workshop.module.css";

export function WorkshopSources({
  value,
  onChange,
  disabled,
}: WorkshopSnapshotProps) {
  const update = (index: number, source: DesignSource) =>
    onChange({
      ...value,
      sources: value.sources.map((item, position) =>
        position === index ? source : item,
      ),
    });
  const add = (kind: "link" | "note") =>
    onChange({
      ...value,
      sources: [
        ...value.sources,
        kind === "link"
          ? { kind, title: "", url: "" }
          : { kind, title: "", text: "" },
      ],
    });
  return (
    <section className={styles.section} aria-label="Материалы проекта">
      <div className={styles.sectionHeading}>
        <div>
          <h2>Материалы</h2>
          <p>Ссылки на референсы и заметки для следующих итераций.</p>
        </div>
      </div>
      {!value.sources.length && (
        <div className={styles.inlineEmpty}>
          Добавьте источники, на которые должен опираться дизайн.
        </div>
      )}
      {value.sources.map((source, index) => (
        <div className={styles.source} key={index}>
          <div className={styles.row}>
            <strong>
              {source.kind === "link" ? "Ссылка" : "Заметка"} {index + 1}
            </strong>
            <UiButton
              variant="ghost"
              size="icon"
              disabled={disabled}
              aria-label={"Удалить материал " + (index + 1)}
              onClick={() =>
                onChange({
                  ...value,
                  sources: value.sources.filter(
                    (_, position) => position !== index,
                  ),
                })
              }
            >
              <Trash2 size={16} />
            </UiButton>
          </div>
          <label className={styles.field}>
            <span>Название</span>
            <UiInput
              value={source.title}
              maxLength={200}
              disabled={disabled}
              onChange={(event) =>
                update(index, { ...source, title: event.target.value })
              }
            />
          </label>
          {source.kind === "link" ? (
            <label className={styles.field}>
              <span>Адрес</span>
              <UiInput
                type="url"
                value={source.url}
                maxLength={2048}
                placeholder="https://"
                disabled={disabled}
                onChange={(event) =>
                  update(index, { ...source, url: event.target.value })
                }
              />
            </label>
          ) : (
            <label className={styles.field}>
              <span>Содержание</span>
              <UiTextarea
                value={source.text}
                rows={4}
                maxLength={8000}
                disabled={disabled}
                onChange={(event) =>
                  update(index, { ...source, text: event.target.value })
                }
              />
            </label>
          )}
        </div>
      ))}
      <div className={styles.actions}>
        <UiButton
          variant="secondary"
          disabled={disabled || value.sources.length >= 16}
          onClick={() => add("link")}
        >
          <Plus size={16} />
          Ссылка
        </UiButton>
        <UiButton
          variant="secondary"
          disabled={disabled || value.sources.length >= 16}
          onClick={() => add("note")}
        >
          <Plus size={16} />
          Заметка
        </UiButton>
      </div>
    </section>
  );
}
