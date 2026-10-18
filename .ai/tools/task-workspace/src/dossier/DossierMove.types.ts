/**
 * @file .ai/tools/task-workspace/src/dossier/DossierMove.types.ts
 * @version 1.0.0
 * @date 2026-10-15
 * @description Описывает фазы переноса досье и минимальное представление legacy-журнала для metadata.
 * @see documentation/specifications/task-management-execution.md
 */
import type { WorkspaceTask } from "./Dossier.types";
import type {
  WorkspaceOperationJournal,
  WorkspaceFileWrite,
  WorkspaceMetadataContext,
} from "../recovery/WorkspaceOperation.types";

export type DossierMoveOperation = {
  phase: "prepared" | "moving" | "publishing" | "completed";
  source: string;
  destination: string;
  before: WorkspaceTask;
  after: WorkspaceTask;
  bodyHash: string;
  manifestHash: string;
  manifestBytes: string;
};

export type DossierMoveOptions = {
  hook?: (phase: string, state: DossierMoveOperation) => void;
};

export type DossierMoveResumeContext = WorkspaceMetadataContext & {
  journal: Pick<
    WorkspaceOperationJournal,
    "phase" | "key" | "kind" | "data"
  > | null;
};

export type LegacyDossierMoveJournal = Record<string, unknown> &
  Omit<DossierMoveOperation, "manifestBytes"> & {
    key: string;
    kind: "archive" | "reopen";
    manifestBytes?: string;
    metadataWrites?: WorkspaceFileWrite[];
    metadataCursor?: number;
  };
