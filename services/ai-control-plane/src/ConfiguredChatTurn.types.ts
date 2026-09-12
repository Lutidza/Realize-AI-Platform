/**
 * @file services/ai-control-plane/src/ConfiguredChatTurn.types.ts
 * @version 1.1.0
 * @date 2026-09-11
 * @description Задаёт вход сборки инструкций и пользовательского контекста одного turn.
 */
import type { ControlPlaneRun } from "./runStore";
import type { ProjectContextFileDto } from "@realize/ai-contracts";

export type ConfiguredChatTurnInput = {
  run: Pick<
    ControlPlaneRun,
    | "prompt"
    | "webSearch"
    | "agentConfiguration"
    | "conversationHistory"
    | "workflow"
  >;
  fileCount: number;
  totalBytes: number;
  selectedFiles: readonly ProjectContextFileDto[];
  attachmentInstructions: string;
};
