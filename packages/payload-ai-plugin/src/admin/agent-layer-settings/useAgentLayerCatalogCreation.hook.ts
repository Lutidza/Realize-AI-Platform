/**
 * @file packages/payload-ai-plugin/src/admin/agent-layer-settings/useAgentLayerCatalogCreation.hook.ts
 * @version 1.0.0
 * @date 2026-09-10
 * @description Хранит выбранный вид новой записи и ограничивает его доступными редакторами.
 */

"use client";

import { useState } from "react";
import type { AIConfigArtifactKind } from "@realize/ai-contracts";
import type { AgentLayerEditableKind } from "./AgentLayerCatalog.types";
import { AGENT_LAYER_EDITABLE_KINDS } from "./agentLayerEditableKinds.config";

export const useAgentLayerCatalogCreation = (kind?: AIConfigArtifactKind) => {
  const [selectedKind, setSelectedKind] =
    useState<AgentLayerEditableKind>("agent_profile");

  return {
    createKind: kind
      ? AGENT_LAYER_EDITABLE_KINDS.find((editableKind) => editableKind === kind)
      : selectedKind,
    selectKind: (value: string) => {
      const nextKind = AGENT_LAYER_EDITABLE_KINDS.find(
        (editableKind) => editableKind === value,
      );
      if (nextKind) setSelectedKind(nextKind);
    },
  };
};
