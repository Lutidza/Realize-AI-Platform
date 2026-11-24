/**
 * @file src/components/admin/documents/DocumentSectionLink.component.tsx
 * @version 1.1.0
 * @date 2026-11-23
 * @description Создаёт обычную ссылку внутри раздела с актуальными параметрами макета и темы.
 * @see documentation/specifications/realize-ai-control-panel-first-release.md
 */
"use client";

import Link from "next/link";
import { useContext } from "react";
import { getUiButtonClassName } from "@realize/ui-kit";
import { controlPanelPreviewStateContext } from "../control-panel-preview/controlPanelPreviewState.context";
import { documentCreateRoute, documentRoute } from "./documentRoutes.util";
import type { DocumentSectionLinkProps } from "./DocumentSectionLink.types";
import styles from "./DocumentSectionLink.module.css";

/** Выбранное оформление записывается в href, в том числе для новой вкладки. */
export function DocumentSectionLink({
  page,
  slug,
  create,
  children,
}: DocumentSectionLinkProps) {
  const appearance = useContext(controlPanelPreviewStateContext);
  if (!appearance)
    throw new Error("Document section links require a preview host.");

  return (
    <Link
      className={create ? getUiButtonClassName() : styles.link}
      href={
        create
          ? documentCreateRoute(page, appearance)
          : documentRoute(page, appearance, slug)
      }
      prefetch={false}
    >
      {children}
    </Link>
  );
}
