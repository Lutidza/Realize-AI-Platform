/**
 * @file src/components/admin/documents/DocumentSectionLink.types.ts
 * @version 1.1.0
 * @date 2026-11-23
 * @description Задаёт переход внутри раздела документов с фиксированным маршрутом возврата.
 * @see documentation/specifications/realize-ai-control-panel-first-release.md
 */
import type { ReactNode } from "react";

/** Для чтения и создания page обозначает исходную страницу списка. */
export type DocumentSectionLinkProps = {
  page: number;
  children: ReactNode;
} & ({ create: true; slug?: never } | { create?: never; slug?: string });
