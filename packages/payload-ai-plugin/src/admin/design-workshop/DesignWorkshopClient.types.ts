/**
 * @file packages/payload-ai-plugin/src/admin/design-workshop/DesignWorkshopClient.types.ts
 * @version 1.0.0
 * @date 2026-09-25
 * @description Определяет контракт переносимого клиента и локального редактора Мастерской.
 * @see documentation/specifications/design-workshop.md
 */

import type {
  DesignBrief,
  DesignChangeDto,
  DesignProjectDto,
  DesignRevisionDto,
  DesignSnapshot,
} from "@realize/ai-contracts";

export type WorkshopClientProps = {
  /** Host задаёт защищённый каталог; клиент не определяет доступ по видимости ссылок. */
  baseHref: string;
  projectId?: string;
  theme: "light" | "dark";
};
export type WorkshopEditorState = {
  project: DesignProjectDto;
  revision: DesignRevisionDto;
  draft: DesignSnapshot;
  summary: string;
  candidate: DesignChangeDto | null;
};
export type WorkshopBriefProps = {
  value: DesignBrief;
  onChange: (value: DesignBrief) => void;
  disabled?: boolean;
};
export type WorkshopSnapshotProps = {
  value: DesignSnapshot;
  onChange: (value: DesignSnapshot) => void;
  disabled?: boolean;
};

export type WorkshopCreateProps = {
  theme: "light" | "dark";
  onClose: () => void;
  onCreated: (projectId: string) => void;
};
export type WorkshopReviewProps = {
  before: DesignSnapshot;
  candidate: DesignChangeDto;
  theme: "light" | "dark";
  busy: boolean;
  error: string;
  onClose: () => void;
  onApply: () => void;
};
export type WorkshopHistoryProps = {
  api: import("./DesignWorkshopApi.client").DesignWorkshopApi;
  projectId: string;
  current: import("@realize/ai-contracts").DesignRevisionRef;
  onRestore: (revision: DesignRevisionDto) => void;
  disabled: boolean;
};
