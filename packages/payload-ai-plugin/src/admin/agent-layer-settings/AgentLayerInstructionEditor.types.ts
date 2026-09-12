/**
 * @file packages/payload-ai-plugin/src/admin/agent-layer-settings/AgentLayerInstructionEditor.types.ts
 * @version 1.0.0
 * @date 2026-09-10
 * @description Задаёт свойства редактора ролей, навыков и шаблонов инструкций.
 */

import type { AIConfigArtifact, AIConfigDraftDTO } from "@realize/ai-contracts";
import type { AgentLayerEditorState } from "./AgentLayerEditor.types";

export type AgentLayerInstructionEditorProps = {
  draft: AIConfigDraftDTO;
  editor: AgentLayerEditorState;
  onOpen: (artifact: AIConfigArtifact) => void;
  onCopy: () => void;
};
