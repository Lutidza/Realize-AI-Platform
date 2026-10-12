/**
 * @file packages/template-realize/src/layouts/admin/SystemAdminSearch.component.tsx
 * @version 1.1.1
 * @date 2026-10-12
 * @description Отображает поиск и палитру переходов с доступной клавиатурной навигацией.
 * @see documentation/architecture/system-admin-shell.md
 */
"use client";
import { ArrowUpRight, Search, SearchX } from "lucide-react";
import { UiButton, UiDialog, UiSearchInput } from "@realize/ui-kit";
import type { SystemAdminSearchProps } from "./SystemAdminToolbar.types";
import { useSystemAdminSearch } from "./useSystemAdminSearch.hook";
import { systemAdminMessages } from "./systemAdminLocale.messages";
import styles from "./SystemAdminToolbar.module.css";

export function SystemAdminSearch({
  entries,
  theme,
  locale = "ru",
}: SystemAdminSearchProps) {
  const t = systemAdminMessages[locale];
  const search = useSystemAdminSearch(entries);
  const { inputRef, triggerRef } = search;
  return (
    <>
      <UiButton
        ref={triggerRef}
        variant="ghost"
        className={styles.searchTrigger}
        aria-label={t.search}
        aria-keyshortcuts="Control+k Meta+k"
        title={`${t.search} · Ctrl/⌘K`}
        onClick={() => search.setOpen(true)}
      >
        <Search size={17} aria-hidden="true" />
        <span>{t.search}</span>
        <kbd>Ctrl / ⌘ K</kbd>
      </UiButton>
      <UiDialog
        open={search.open}
        onOpenChange={search.setOpen}
        mode={theme}
        title={t.search}
        initialFocusRef={inputRef}
        onCloseAutoFocus={search.onCloseAutoFocus}
        footer={<span className={styles.searchHint}>{t.searchHint}</span>}
      >
        <UiSearchInput
          ref={inputRef}
          placeholder={t.searchPlaceholder}
          aria-label={t.searchLabel}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded="true"
          aria-controls={search.listId}
          aria-activedescendant={search.activeId}
          value={search.query}
          onChange={(event) => search.setQuery(event.target.value)}
          onKeyDown={search.onKeyDown}
          autoComplete="off"
        />
        <div
          className={styles.searchResults}
          role="listbox"
          id={search.listId}
          aria-label={t.searchResults}
        >
          {search.results.map((entry, index) => (
            <UiButton
              variant="ghost"
              tabIndex={-1}
              key={entry.id}
              id={`${search.listId}-${index}`}
              role="option"
              aria-selected={index === search.activeIndex}
              className={styles.searchResult}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => search.select(entry)}
            >
              <span className={styles.resultIcon}>
                {entry.icon ?? <Search size={17} aria-hidden="true" />}
              </span>
              <span className={styles.resultText}>
                <strong>{entry.label}</strong>
                <small>{entry.description ?? entry.group}</small>
              </span>
              <span className={styles.resultGroup}>{entry.group}</span>
              <ArrowUpRight size={15} aria-hidden="true" />
            </UiButton>
          ))}
        </div>
        {!search.results.length && (
          <div className={styles.empty} role="status">
            <SearchX size={25} aria-hidden="true" />
            <strong>{t.notFound}</strong>
            <p>{t.tryAnother}</p>
          </div>
        )}
      </UiDialog>
    </>
  );
}
