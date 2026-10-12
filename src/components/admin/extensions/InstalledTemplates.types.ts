/**
 * @file src/components/admin/extensions/InstalledTemplates.types.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Описывает readonly inventory transport и действия карточек без копирования core DTO.
 */
import type {
  InstalledTemplatesSnapshotDto,
  InstalledTemplateEntryDto,
} from "@realize/payload-extension-manager/contracts";
import type { TemplateTarget } from "@realize/template-contracts";

export type InstalledTemplatesTransport = {
  snapshot: (signal?: AbortSignal) => Promise<InstalledTemplatesSnapshotDto>;
};
export type InstalledTemplatesProps = {
  snapshot: InstalledTemplatesSnapshotDto | null;
  target: TemplateTarget;
  loading: boolean;
  error: string | null;
  locked: boolean;
  onRefresh: () => void;
  onSelect: (entry: InstalledTemplateEntryDto) => void;
  onSettings: (entry: InstalledTemplateEntryDto) => void;
};
export type InstalledTemplateCardProps = Pick<
  InstalledTemplatesProps,
  "target" | "locked" | "onSelect" | "onSettings"
> & {
  entry: InstalledTemplateEntryDto;
};
