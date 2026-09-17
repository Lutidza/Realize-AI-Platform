/**
 * @file src/components/admin/media/reference/MediaReference.types.ts
 * @version 1.0.0
 * @date 2026-09-14
 * @description Контракты материалов и представлений локального макета.
 * @see documentation/specifications/media-management-references.md
 */

import type { RefCallback } from "react";
import type { useMediaReferenceWorkbench } from "./useMediaReferenceWorkbench.hook";

export type Scenario = "normal" | "empty" | "loading" | "error" | "denied";
export type Section =
  "library" | "upload" | "profiles" | "processing" | "block" | "sources";
export type Purpose = "Фото товара" | "Баннер" | "Контент";
export type Asset = {
  id: string;
  name: string;
  kind: "image" | "other";
  purpose: Purpose;
  folder: string;
  date: string;
  alt: string;
  caption: string;
  url?: string;
  size?: number;
  local?: boolean;
  previewError?: boolean;
};
export type LibraryContext = {
  search: string;
  kind: string;
  purpose: string;
  folder: string;
  sort: string;
  view: "grid" | "list";
  page: number;
};
export type ProfileVariant = { width: string; quality: string; format: string };
export type Profile = Record<"small" | "medium" | "large", ProfileVariant>;
export type ProcessingRow = {
  id: string;
  name: string;
  batch: string;
  status: "Готово" | "В очереди" | "Ошибка";
};
export type Workbench = ReturnType<typeof useMediaReferenceWorkbench>;
export type ScreenProps = { model: Workbench };
export type ScrollPosition = { element: Element; top: number; left: number };
/** Общая библиотека хранит контекст у владельца, независимо от режима выбора. */
export type LibraryProps = {
  model: Workbench;
  picker?: boolean;
  attachSearchInput?: RefCallback<HTMLInputElement>;
};
export type AssetCardProps = {
  asset: Asset;
  selected?: boolean;
  onSelect?: (element: HTMLButtonElement) => void;
  onPreviewError: (id: string) => void;
  disabled?: boolean;
};
