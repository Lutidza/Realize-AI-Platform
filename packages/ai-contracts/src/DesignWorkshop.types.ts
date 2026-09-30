/**
 * @file packages/ai-contracts/src/DesignWorkshop.types.ts
 * @version 1.1.0
 * @date 2026-09-26
 * @description Задаёт общий контракт сохранённых дизайн-проектов, версий и подготовленных правок.
 * @see documentation/specifications/design-workshop.md
 */
import type { z } from "zod";
import type {
  designBriefSchema,
  designFileSchema,
  designSnapshotSchema,
  designSourceSchema,
  designWorkshopCommands,
} from "./designWorkshop.schemas";

export type DesignBrief = z.infer<typeof designBriefSchema>;
export type DesignSource = z.infer<typeof designSourceSchema>;
export type DesignFile = z.infer<typeof designFileSchema>;
export type DesignSnapshot = z.infer<typeof designSnapshotSchema>;
export type CreateDesignProjectInput = z.infer<
  typeof designWorkshopCommands.create
>;
export type PrepareDesignChangeInput = z.infer<
  typeof designWorkshopCommands.prepare
>;

/** Ссылка обозначает точный immutable snapshot, а не текущий mutable head. */
export type DesignRevisionRef = {
  revisionId: string;
  number: number;
  contentHash: string;
};

export type DesignProjectDto = {
  projectId: string;
  title: string;
  target: CreateDesignProjectInput["target"];
  kind: CreateDesignProjectInput["kind"];
  workspace: { mode: "stored_draft"; bindingId: string };
  currentRevision: DesignRevisionRef;
  createdAt: string;
  updatedAt: string;
};

export type DesignRevisionDto = DesignRevisionRef & {
  projectId: string;
  parentRevisionId: string | null;
  author: { actorId: string; channel: "admin" | "mcp" };
  snapshot: DesignSnapshot;
  createdAt: string;
};

/** Hash-diff проверяется по base revision и полному candidate snapshot. */
export type DesignSnapshotDiffDto = {
  briefChanged: boolean;
  sourcesChanged: boolean;
  files: {
    path: string;
    kind: "added" | "modified" | "deleted";
    beforeHash: string | null;
    afterHash: string | null;
  }[];
};

export type DesignChangeDto = {
  changeId: string;
  projectId: string;
  baseRevision: DesignRevisionRef;
  candidateHash: string;
  candidate: DesignSnapshot;
  diff: DesignSnapshotDiffDto;
  summary: string;
  status: "prepared" | "applied" | "expired";
  appliedRevisionId: string | null;
  createdAt: string;
  expiresAt: string;
};

/** Durable ответ мутации; для prepare revision указывает базу, changeId — кандидат. */
export type DesignMutationReceiptDto = {
  operationId: string;
  action: "create" | "prepare" | "apply";
  projectId: string;
  revision: DesignRevisionRef;
  changeId: string | null;
};

export type DesignPageDto<T> = {
  items: T[];
  page: number;
  limit: number;
  hasNextPage: boolean;
};
