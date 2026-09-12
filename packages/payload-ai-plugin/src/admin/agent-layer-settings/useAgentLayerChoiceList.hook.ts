/**
 * @file packages/payload-ai-plugin/src/admin/agent-layer-settings/useAgentLayerChoiceList.hook.ts
 * @version 1.1.0
 * @date 2026-09-10
 * @description Управляет поиском и страницами выбора, сохраняя отсутствующие ключи до явного изменения.
 */

"use client";

import { useState } from "react";
import type {
  AgentLayerChoiceListState,
  AgentLayerChoiceOption,
  UseAgentLayerChoiceListOptions,
} from "./AgentLayerChoiceList.types";

const PAGE_SIZE = 25;

/** Поиск меняет только выдачу; выбор разрешён исключительно среди переданных вариантов. */
export const useAgentLayerChoiceList = ({
  options,
  selectedKeys,
  disabled,
  mode = "multiple",
  limit = 128,
  onChange,
  filterOption,
}: UseAgentLayerChoiceListOptions): AgentLayerChoiceListState => {
  const [query, setQuery] = useState("");
  const [selectedOnly, setSelectedOnly] = useState(false);
  const [requestedPage, setRequestedPage] = useState(1);
  const byKey = new Map(options.map((option) => [option.key, option]));
  const selected = new Set(selectedKeys);
  const missingKeys = [...selected].filter((key) => !byKey.has(key));
  const choices: AgentLayerChoiceOption[] = [
    ...missingKeys.map((key) => ({ key, title: key, missing: true })),
    ...byKey.values(),
  ];
  const normalizedQuery = query.trim().toLocaleLowerCase("ru-RU");
  const filtered = choices
    .map((option) => ({ ...option, selected: selected.has(option.key) }))
    .filter(
      (option) =>
        (!filterOption || filterOption(option)) &&
        (!selectedOnly || option.selected) &&
        `${option.title} ${option.code ?? option.key} ${option.description ?? ""}`
          .toLocaleLowerCase("ru-RU")
          .includes(normalizedQuery),
    )
    .sort(
      (left, right) =>
        Number(Boolean(right.missing)) - Number(Boolean(left.missing)) ||
        left.title.localeCompare(right.title, "ru-RU", { numeric: true }) ||
        left.key.localeCompare(right.key),
    );
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Math.min(requestedPage, pageCount);
  const offset = (page - 1) * PAGE_SIZE;
  const selectionLimit = mode === "single" ? 1 : limit;
  return {
    query,
    selectedOnly,
    page,
    pageCount,
    rows: filtered.slice(offset, offset + PAGE_SIZE),
    selectedCount: selected.size,
    missingCount: choices.filter(
      (option) => option.missing && selected.has(option.key),
    ).length,
    totalCount: choices.length,
    filteredCount: filtered.length,
    rangeStart: filtered.length ? offset + 1 : 0,
    rangeEnd: Math.min(offset + PAGE_SIZE, filtered.length),
    limit: selectionLimit,
    isAtLimit: selectedKeys.length >= selectionLimit,
    disabled,
    mode,
    setQuery: (value) => {
      setQuery(value);
      setRequestedPage(1);
    },
    setSelectedOnly: (value) => {
      setSelectedOnly(value);
      setRequestedPage(1);
    },
    setPage: (value) => setRequestedPage(Math.max(1, value)),
    toggle: (key) => {
      if (disabled || mode === "readOnly") return;
      if (mode === "multiple" && selected.has(key)) {
        onChange(selectedKeys.filter((item) => item !== key));
      } else if (byKey.has(key) && !byKey.get(key)?.missing) {
        if (mode === "single") {
          if (!selected.has(key)) onChange([key]);
        } else if (selectedKeys.length < selectionLimit) {
          onChange([...selectedKeys, key]);
        }
      }
    },
  };
};
