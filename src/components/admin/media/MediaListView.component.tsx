/**
 * @file src/components/admin/media/MediaListView.component.tsx
 * @version 1.0.0
 * @date 2026-09-14
 * @description Добавляет сетку файлов к штатному списку Payload, сохраняя его запросы и операции.
 * @see documentation/specifications/media-management.md
 */
"use client";

import {
  DefaultListView,
  useListDrawerContext,
  useTheme,
} from "@payloadcms/ui";
import { UiButton, UiTheme } from "@realize/ui-kit";
import { Grid2X2, List } from "lucide-react";
import type { ListViewClientProps } from "payload";
import { useState } from "react";

import { MediaLibraryGrid } from "./MediaLibraryGrid.component";
import styles from "./MediaListView.module.css";

/** Native list также открывается в upload fields: drawer всегда получает исходный Table. */
export function MediaListView(props: ListViewClientProps) {
  const { isInDrawer } = useListDrawerContext();
  const { theme } = useTheme();
  const [view, setView] = useState<"grid" | "list">("grid");

  if (isInDrawer || props.viewType !== "list") {
    return <DefaultListView {...props} />;
  }

  return (
    <DefaultListView
      {...props}
      BeforeListTable={
        <>
          {props.BeforeListTable}
          <UiTheme mode={theme}>
            <div className={styles.toolbar}>
              <p>Библиотека файлов</p>
              <div
                className={styles.views}
                role="group"
                aria-label="Вид медиатеки"
              >
                <UiButton
                  size="small"
                  variant="secondary"
                  aria-pressed={view === "grid"}
                  onClick={() => setView("grid")}
                >
                  <Grid2X2 aria-hidden size={16} />
                  Сетка
                </UiButton>
                <UiButton
                  size="small"
                  variant="secondary"
                  aria-pressed={view === "list"}
                  onClick={() => setView("list")}
                >
                  <List aria-hidden size={16} />
                  Список
                </UiButton>
              </div>
            </div>
          </UiTheme>
        </>
      }
      Table={
        view === "grid" ? (
          <MediaLibraryGrid enableRowSelections={props.enableRowSelections} />
        ) : (
          props.Table
        )
      }
    />
  );
}
