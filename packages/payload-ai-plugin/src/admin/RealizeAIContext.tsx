/**
 * @file packages/payload-ai-plugin/src/admin/RealizeAIContext.tsx
 * @version 2026-08-28
 * @description Разделяет chat и governed change/source/release actions между Admin surfaces.
 */

"use client";

import type {
  ChangeRequestDTO,
  ConversationDTO,
  ConversationDetailDTO,
  DataOperationDTO,
  RunDTO,
  RuntimeStatusDTO,
} from "@realize/ai-contracts";
import { createContext, useContext } from "react";

import type { RunStreamState } from "./runStreamTypes";

/** State and actions owned once by the Admin-level AI provider. */
export type RealizeAIController = {
  cancel: () => Promise<void>;
  clearError: () => void;
  conversations: ConversationDTO[];
  applyDataOperation: (operation: DataOperationDTO) => Promise<void>;
  approveDataRollback: (operation: DataOperationDTO) => Promise<void>;
  createChangeRequest: (messageID: string) => Promise<void>;
  createDataOperation: (messageID: string) => Promise<void>;
  currentRun?: RunDTO;
  decideChangeRequest: (
    change: ChangeRequestDTO,
    decision: "approve" | "reject",
    comment?: string,
  ) => Promise<void>;
  decideImplementation: (
    change: ChangeRequestDTO,
    decision: "approve" | "reject",
    comment?: string,
  ) => Promise<void>;
  decideDataOperation: (
    operation: DataOperationDTO,
    decision: "approve" | "reject",
    comment?: string,
  ) => Promise<void>;
  decidePreview: (
    change: ChangeRequestDTO,
    decision: "approve" | "reject",
    comment?: string,
  ) => Promise<void>;
  decideRelease: (
    change: ChangeRequestDTO,
    decision: "approve" | "reject",
    comment?: string,
  ) => Promise<void>;
  detail?: ConversationDetailDTO;
  draft: string;
  error?: string;
  isCreatingConversation: boolean;
  isPlanActionPending?: string;
  isSubmitting: boolean;
  executeChangeRequest: (change: ChangeRequestDTO) => Promise<void>;
  deployPreview: (change: ChangeRequestDTO) => Promise<void>;
  prepareRelease: (change: ChangeRequestDTO) => Promise<void>;
  publishPullRequest: (change: ChangeRequestDTO) => Promise<void>;
  rollbackDataOperation: (operation: DataOperationDTO) => Promise<void>;
  openConversation: (id: string) => Promise<void>;
  ready: boolean;
  runtime?: RuntimeStatusDTO;
  search: string;
  selectedConversationID?: string;
  send: () => Promise<void>;
  setDraft: (value: string) => void;
  setSearch: (value: string) => void;
  startConversation: () => Promise<void>;
  stream: RunStreamState;
};

export const RealizeAIContext = createContext<RealizeAIController | null>(null);

/** Reads the provider-owned chat controller and fails on invalid composition. */
export const useRealizeAIController = (): RealizeAIController => {
  const controller = useContext(RealizeAIContext);
  if (!controller) {
    throw new Error("Realize AI Admin provider is not installed.");
  }
  return controller;
};
