/**
 * @file packages/payload-ai-plugin/src/admin/agent-layer-settings/AgentLayerChoiceList.component.tsx
 * @version 1.0.0
 * @date 2026-09-10
 * @description Отображает общий список выбора с поиском, страницами и состоянием сохранённых ключей.
 */

import { UiBadge, UiButton, UiInput } from "@realize/ui-kit";
import {
  ArrowUpRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Plus,
} from "lucide-react";
import type {
  AgentLayerChoiceListProps,
  AgentLayerChoiceOption,
} from "./AgentLayerChoiceList.types";
import styles from "./AgentLayerProfileEditor.module.css";

const renderLabel = (option: AgentLayerChoiceOption) => (
  <span className={styles.referenceLabel}>
    <strong>{option.title}</strong>
    {option.code && <code>{option.code}</code>}
    {option.description && (
      <small className={styles.muted}>{option.description}</small>
    )}
  </span>
);

/** Общий вид используется для связей черновика, системных целей и сужения доступов. */
export const AgentLayerChoiceList = ({
  label,
  picker,
  navigationDisabled,
  onOpen,
  emptyLabel = "Доступных вариантов пока нет.",
}: AgentLayerChoiceListProps) => (
  <>
    <div className={styles.pickerToolbar}>
      <UiInput
        type="search"
        aria-label={`Поиск связей: ${label}`}
        placeholder="Поиск по названию или ключу"
        value={picker.query}
        onChange={(event) => picker.setQuery(event.target.value)}
      />
      {picker.mode !== "readOnly" && (
        <div
          className={styles.pickerModes}
          role="group"
          aria-label={`Показать связи: ${label}`}
        >
          <UiButton
            variant="ghost"
            size="small"
            aria-pressed={!picker.selectedOnly}
            onClick={() => picker.setSelectedOnly(false)}
          >
            Все
          </UiButton>
          <UiButton
            variant="ghost"
            size="small"
            aria-pressed={picker.selectedOnly}
            onClick={() => picker.setSelectedOnly(true)}
          >
            Выбранные
          </UiButton>
        </div>
      )}
    </div>
    <div className={styles.pickerPagination}>
      <p className={styles.muted} role="status">
        {picker.rangeStart}–{picker.rangeEnd} из {picker.filteredCount}
        {picker.mode !== "readOnly" && (
          <>
            {" "}
            · выбрано {picker.selectedCount} / {picker.limit}
          </>
        )}
      </p>
      <div className={styles.pickerPages}>
        <UiButton
          variant="ghost"
          size="icon"
          aria-label={`Предыдущая страница связей: ${label}`}
          disabled={picker.page === 1}
          onClick={() => picker.setPage(picker.page - 1)}
        >
          <ChevronLeft size={16} aria-hidden="true" />
        </UiButton>
        <span>
          {picker.page} / {picker.pageCount}
        </span>
        <UiButton
          variant="ghost"
          size="icon"
          aria-label={`Следующая страница связей: ${label}`}
          disabled={picker.page === picker.pageCount}
          onClick={() => picker.setPage(picker.page + 1)}
        >
          <ChevronRight size={16} aria-hidden="true" />
        </UiButton>
      </div>
    </div>
    {picker.rows.length ? (
      <ul
        key={JSON.stringify([picker.page, picker.query, picker.selectedOnly])}
        className={styles.referenceRows}
        aria-label={`Список связей: ${label}`}
        tabIndex={0}
      >
        {picker.rows.map((option) => (
          <li className={styles.referenceRow} key={option.key}>
            {picker.mode === "readOnly" ? (
              <div
                className={`${styles.referenceChoice} ${styles.referencePreview}`}
              >
                {renderLabel(option)}
              </div>
            ) : (
              <UiButton
                variant="ghost"
                className={styles.referenceChoice}
                aria-pressed={option.selected}
                aria-label={`${option.selected ? (picker.mode === "single" ? "Выбрано" : "Убрать") : "Выбрать"} «${option.title}»`}
                disabled={
                  picker.disabled ||
                  (!option.selected &&
                    (Boolean(option.missing) ||
                      (picker.mode === "multiple" && picker.isAtLimit)))
                }
                onClick={() => picker.toggle(option.key)}
              >
                {option.selected ? (
                  <Check size={17} aria-hidden="true" />
                ) : (
                  <Plus size={17} aria-hidden="true" />
                )}
                {renderLabel(option)}
                {option.missing ? (
                  <UiBadge tone="danger">Не найдено</UiBadge>
                ) : option.inactive ? (
                  <UiBadge
                    tone={
                      option.selected && option.inactiveIsProblem
                        ? "danger"
                        : "neutral"
                    }
                  >
                    Выключено
                  </UiBadge>
                ) : null}
              </UiButton>
            )}
            {option.canOpen && onOpen && (
              <UiButton
                variant="ghost"
                size="icon"
                aria-label={`Открыть «${option.title}»`}
                title="Открыть запись"
                disabled={navigationDisabled}
                onClick={() => onOpen(option.key)}
              >
                <ArrowUpRight size={17} aria-hidden="true" />
              </UiButton>
            )}
          </li>
        ))}
      </ul>
    ) : (
      <p className={styles.pickerEmpty}>
        {picker.query
          ? "По этому запросу записей нет."
          : picker.selectedOnly
            ? "В этой группе пока ничего не выбрано."
            : emptyLabel}
      </p>
    )}
    {picker.mode === "multiple" && picker.isAtLimit && (
      <p className={styles.muted}>
        Достигнут лимит группы. Снимите выбор с записи, чтобы добавить другую.
      </p>
    )}
  </>
);
