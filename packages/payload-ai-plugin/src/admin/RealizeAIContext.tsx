/**
 * @file packages/payload-ai-plugin/src/admin/RealizeAIContext.tsx
 * @version 2026-08-21
 * @description Shares one durable chat controller between the global drawer and full Admin view.
 */

"use client";

import type {
  ChangeRequestDTO,
  ConversationDTO,
  ConversationDetailDTO,
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
  createChangeRequest: (messageID: string) => Promise<void>;
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
  decidePreview: (
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
