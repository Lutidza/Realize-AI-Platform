/**
 * @file services/ai-execution-worker/src/design-workshop/DesignWorkspace.types.ts
 * @version 1.0.0
 * @date 2026-09-25
 * @description Описывает внутренние порты хранения и наблюдения файловой версии макета.
 * @see documentation/specifications/design-workshop.md
 */
import type {
  DesignWorkspaceManifest,
  DesignWorkspaceReceipt,
} from "@realize/ai-contracts";

export type DesignWorkspacePhase =
  "staging" | "prepared" | "published" | "committed";
export type DesignWorkspaceOptions = {
  repositoryRoot: string;
  storageRoot: string;
  onCheckpoint?: (event: {
    phase: DesignWorkspacePhase;
    bindingId: string;
    revisionId: string;
  }) => Promise<void>;
};
export type DesignWorkspaceAttempt = {
  directory: string;
  workspace: string;
};
export type DesignWorkspaceBinding = {
  directory: string;
  revisions: string;
  transactions: string;
  receipts: string;
};
export type DesignWorkspaceCheckpoint = {
  schemaVersion: "1.0";
  phase: "staging" | "prepared";
  receipt: DesignWorkspaceReceipt;
};
/** Только внутренний port trusted worker; directory не передаётся HTTP/MCP-клиенту. */
export type ResolvedDesignWorkspace = {
  directory: string;
  receipt: DesignWorkspaceReceipt;
  manifest: DesignWorkspaceManifest;
};
export type DesignWorkspaceErrorCode =
  | "INVALID_ROOT"
  | "NOT_FOUND"
  | "INTEGRITY"
  | "CONFLICT"
  | "CAPACITY"
  | "CANCELLED"
  | "IO";
