/**
 * @file packages/payload-ai-plugin/src/chat-context/WorkflowSegment.types.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Задаёт зависимости выполнения одного сохранённого сегмента процесса.
 */
import type { PayloadRequest } from "payload";
import type { AIDocument, AIRepository } from "../endpoints/repository";
import type { SanitizedRealizeAIPluginOptions } from "../types";
import type { ChatRunContext } from "./ChatRunContext.types";

export type WorkflowSegmentInput = {
  req: PayloadRequest;
  options: SanitizedRealizeAIPluginOptions;
  userID: string | number;
  conversationID: string;
  repository: AIRepository;
  run: AIDocument;
  context: ChatRunContext;
};
