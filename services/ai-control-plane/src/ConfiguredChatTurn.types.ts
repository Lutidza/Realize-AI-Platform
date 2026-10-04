/**
 * @file services/ai-control-plane/src/ConfiguredChatTurn.types.ts
 * @version 1.4.0
 * @date 2026-09-30
 * @description Задаёт вход сборки инструкций и пользовательского контекста одного turn.
 */
import type { ControlPlaneRun } from "./runStore";
import type {
  ProjectContextFileDto,
  CodexRepositorySearchSettings,
} from "@realize/ai-contracts";

export type ConfiguredChatTurnInput = {
  repositorySearch?: CodexRepositorySearchSettings;
  run: Pick<
    ControlPlaneRun,
    | "prompt"
    | "webSearch"
    | "agentConfiguration"
    | "conversationHistory"
    | "workflow"
    | "pageDraftContext"
    | "pageDiscovery"
  >;
  fileCount: number;
  totalBytes: number;
  selectedFiles: readonly ProjectContextFileDto[];
  attachmentInstructions: string;
};
