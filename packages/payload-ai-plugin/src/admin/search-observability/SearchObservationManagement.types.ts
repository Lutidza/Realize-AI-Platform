/**
 * @file packages/payload-ai-plugin/src/admin/search-observability/SearchObservationManagement.types.ts
 * @version 1.0.0
 * @date 2026-09-28
 * @description Описывает draft настроек и props управления диагностикой в Admin.
 */
import type { RefObject } from "react";
import type {
  SearchObservationCleanupPreview,
  SearchObservationSettings,
} from "@realize/ai-contracts";

export type SearchObservationSettingsFields = {
  [K in keyof SearchObservationSettings]: string;
};
export type SearchObservationSettingsDraft = {
  revision: number;
  fields: SearchObservationSettingsFields;
};
export type SearchObservationManagementProps = {
  apiURL: string;
  onChange: () => void;
};
export type SearchObservationCleanupDialogProps = {
  preview: SearchObservationCleanupPreview | null;
  pending: boolean;
  error: string | null;
  triggerRef: RefObject<HTMLButtonElement | null>;
  onConfirm: () => void;
  onClose: () => void;
};
