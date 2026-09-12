/**
 * @file packages/payload-ai-plugin/src/admin/agent-layer-settings/useAgentLayerWorkspace.hook.ts
 * @version 1.6.0
 * @date 2026-09-11
 * @description Сохраняет контекст каталогов и защищает форму при переходах между записями и разделами.
 */

"use client";

import { useEffect, useRef, useState } from "react";
import type { AIConfigArtifact } from "@realize/ai-contracts";
import type { AIConfigurationArtifactLink } from "../RealizeAILinks.types";
import type { AgentLayerCatalogState } from "./AgentLayerCatalog.types";
import type { AgentLayerVersionsState } from "./AgentLayerVersions.types";
import type { AgentLayerInstructionKind } from "./AgentLayerInstruction.types";
import { isAgentLayerInstructionArtifact } from "./isAgentLayerInstructionArtifact.util";
import type { AgentLayerBindingKind } from "./AgentLayerBinding.types";
import { isAgentLayerBindingArtifact } from "./isAgentLayerBindingArtifact.util";
import type {
  AgentLayerSection,
  AgentLayerSelection,
  UseAgentLayerWorkspaceOptions,
} from "./AgentLayerWorkspace.types";

const emptyCatalog: AgentLayerCatalogState = {
  search: "",
  status: "all",
  usage: "all",
  sort: "title",
  page: 1,
};

export const useAgentLayerWorkspace = ({
  configuration,
  editor,
}: UseAgentLayerWorkspaceOptions) => {
  const [section, setSection] = useState<AgentLayerSection>("overview");
  const [selection, setSelection] = useState<AgentLayerSelection>();
  const [isViewingRelease, setViewingRelease] = useState(false);
  const [releaseArtifact, setReleaseArtifact] =
    useState<AIConfigurationArtifactLink>();
  const [versions, setVersions] = useState<AgentLayerVersionsState>({
    mode: "drafts",
    query: "",
    page: 1,
  });
  const [catalogs, setCatalogs] = useState<
    Partial<Record<AgentLayerSection, AgentLayerCatalogState>>
  >({});
  const [returnSection, setReturnSection] = useState<AgentLayerSection>("all");
  const draft = configuration.draft;
  const activeSelection =
    selection?.draftID === draft?.id ? selection : undefined;
  const isNewSelection = activeSelection && "selectionID" in activeSelection;
  const selectedForm =
    activeSelection?.kind === "new_profile"
      ? editor.profileForm
      : activeSelection?.kind === "new_instruction"
        ? editor.instructionForm
        : activeSelection?.kind === "new_binding"
          ? editor.bindingForm
          : activeSelection?.kind === "new_workflow"
            ? editor.workflowForm
            : editor.form;
  const selectedArtifact = isNewSelection
    ? draft?.artifacts.find(
        (item) =>
          item.kind ===
            (activeSelection.kind === "new_profile"
              ? "agent_profile"
              : activeSelection.kind === "new_instruction" ||
                  activeSelection.kind === "new_binding"
                ? activeSelection.artifactKind
                : activeSelection.kind === "new_workflow"
                  ? "workflow_definition"
                  : "local_rule") && item.key === selectedForm?.originalKey,
      )
    : activeSelection &&
      draft?.artifacts.find(
        (item) =>
          item.kind === activeSelection.kind &&
          item.key === activeSelection.key,
      );
  const isNewRule =
    activeSelection?.kind === "new_rule" && Boolean(editor.form);
  const isNewProfile =
    activeSelection?.kind === "new_profile" && Boolean(editor.profileForm);
  const newInstructionKind =
    activeSelection?.kind === "new_instruction" && editor.instructionForm
      ? activeSelection.artifactKind
      : undefined;
  const newBindingKind =
    activeSelection?.kind === "new_binding" && editor.bindingForm
      ? activeSelection.artifactKind
      : undefined;
  const isNewWorkflow =
    activeSelection?.kind === "new_workflow" && Boolean(editor.workflowForm);
  const contentRef = useRef<HTMLDivElement>(null);
  const navigationKey =
    isViewingRelease && configuration.release
      ? `release:${configuration.release.id}`
      : activeSelection &&
          (selectedArtifact ||
            isNewRule ||
            isNewProfile ||
            newInstructionKind ||
            newBindingKind ||
            isNewWorkflow)
        ? `${activeSelection.draftID}:${activeSelection.kind}:${"selectionID" in activeSelection ? activeSelection.selectionID : activeSelection.key}`
        : section;
  const previousNavigation = useRef(navigationKey);
  // Заголовок получает фокус только при смене содержимого, без перехвата ввода и сохранения.
  useEffect(() => {
    if (previousNavigation.current === navigationKey) return;
    previousNavigation.current = navigationKey;
    const heading = contentRef.current?.querySelector<HTMLHeadingElement>("h2");
    if (heading) {
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    }
  }, [navigationKey]);

  const selectSection = (next: AgentLayerSection) => {
    if (editor.isLocked || !editor.close()) return;
    setSelection(undefined);
    setViewingRelease(false);
    setSection(next);
  };
  const openArtifact = (artifact: AIConfigArtifact) => {
    if (!draft || editor.isLocked) return;
    if (
      artifact.kind === "local_rule"
        ? !editor.selectRule(artifact)
        : artifact.kind === "agent_profile"
          ? !editor.selectProfile(artifact)
          : isAgentLayerInstructionArtifact(artifact)
            ? !editor.selectInstruction(artifact)
            : isAgentLayerBindingArtifact(artifact)
              ? !editor.selectBinding(artifact)
              : artifact.kind === "workflow_definition"
                ? !editor.selectWorkflow(artifact)
                : !editor.close()
    )
      return;
    if (
      !selectedArtifact &&
      !isNewRule &&
      !isNewProfile &&
      !newInstructionKind &&
      !newBindingKind &&
      !isNewWorkflow
    )
      setReturnSection(section);
    setSelection({ draftID: draft.id, kind: artifact.kind, key: artifact.key });
  };
  const closeArtifact = () => {
    if (!editor.close()) return;
    setSelection(undefined);
    setSection(returnSection);
  };
  const newRule = () => {
    if (!draft || !editor.newRule()) return;
    setReturnSection(section);
    setSelection({
      draftID: draft.id,
      kind: "new_rule",
      selectionID: crypto.randomUUID(),
    });
  };
  const newProfile = () => {
    if (!draft || !editor.newProfile()) return;
    setReturnSection(section);
    setSelection({
      draftID: draft.id,
      kind: "new_profile",
      selectionID: crypto.randomUUID(),
    });
  };
  const copyProfile = () => {
    if (
      !draft ||
      selectedArtifact?.kind !== "agent_profile" ||
      !editor.copyProfile(selectedArtifact)
    )
      return;
    setSelection({
      draftID: draft.id,
      kind: "new_profile",
      selectionID: crypto.randomUUID(),
    });
  };
  const newInstruction = (kind: AgentLayerInstructionKind) => {
    if (!draft || !editor.newInstruction(kind)) return;
    setReturnSection(section);
    setSelection({
      draftID: draft.id,
      kind: "new_instruction",
      artifactKind: kind,
      selectionID: crypto.randomUUID(),
    });
  };
  const copyInstruction = () => {
    if (
      !draft ||
      !selectedArtifact ||
      !isAgentLayerInstructionArtifact(selectedArtifact) ||
      !editor.copyInstruction(selectedArtifact)
    )
      return;
    setSelection({
      draftID: draft.id,
      kind: "new_instruction",
      artifactKind: selectedArtifact.kind,
      selectionID: crypto.randomUUID(),
    });
  };
  const newBinding = (kind: AgentLayerBindingKind) => {
    if (!draft || !editor.newBinding(kind)) return;
    setReturnSection(section);
    setSelection({
      draftID: draft.id,
      kind: "new_binding",
      artifactKind: kind,
      selectionID: crypto.randomUUID(),
    });
  };
  const copyBinding = () => {
    if (
      !draft ||
      !selectedArtifact ||
      !isAgentLayerBindingArtifact(selectedArtifact) ||
      !editor.copyBinding(selectedArtifact)
    )
      return;
    setSelection({
      draftID: draft.id,
      kind: "new_binding",
      artifactKind: selectedArtifact.kind,
      selectionID: crypto.randomUUID(),
    });
  };
  const newWorkflow = () => {
    if (!draft || !editor.newWorkflow()) return;
    setReturnSection(section);
    setSelection({
      draftID: draft.id,
      kind: "new_workflow",
      selectionID: crypto.randomUUID(),
    });
  };
  const copyWorkflow = () => {
    if (
      !draft ||
      selectedArtifact?.kind !== "workflow_definition" ||
      !editor.copyWorkflow(selectedArtifact)
    )
      return;
    setSelection({
      draftID: draft.id,
      kind: "new_workflow",
      selectionID: crypto.randomUUID(),
    });
  };
  const selectDraft = async (id: string) => {
    if (!(await editor.selectDraft(id))) return false;
    setSelection(undefined);
    setViewingRelease(false);
    return true;
  };
  const createDraft = async (copySelected?: boolean) => {
    if (!(await editor.createDraft(copySelected))) return false;
    setSelection(undefined);
    setViewingRelease(false);
    return true;
  };
  const refresh = async () => {
    if (!(await editor.refresh())) return false;
    setSelection(undefined);
    return true;
  };
  return {
    versions,
    setVersions,
    isViewingRelease,
    releaseArtifact,
    openRelease: async (
      id: string,
      artifact?: AIConfigurationArtifactLink,
    ): Promise<boolean> => {
      if (editor.isLocked || !editor.close()) return false;
      if (!(await configuration.openRelease(id))) return false;
      setSelection(undefined);
      setReleaseArtifact(artifact);
      setViewingRelease(true);
      setSection("versions");
      return true;
    },
    createRelease: async () => {
      if (editor.isLocked || editor.isDirty || !editor.close()) return;
      setSelection(undefined);
      setReleaseArtifact(undefined);
      setViewingRelease(true);
      setSection("versions");
      setVersions({ mode: "releases", query: "", page: 1 });
      await configuration.createRelease();
    },
    closeRelease: () => {
      if (editor.isLocked) return;
      setViewingRelease(false);
      setSection("versions");
    },
    section,
    selectedArtifact,
    isNewRule,
    isNewProfile,
    newInstructionKind,
    newBindingKind,
    isNewWorkflow,
    recordIdentity: navigationKey,
    selectSection,
    openArtifact,
    closeArtifact,
    newRule,
    newProfile,
    copyProfile,
    newInstruction,
    copyInstruction,
    newBinding,
    copyBinding,
    newWorkflow,
    copyWorkflow,
    selectDraft,
    createDraft,
    refresh,
    contentRef,
    catalog: catalogs[section] ?? emptyCatalog,
    setCatalog: (value: AgentLayerCatalogState) =>
      setCatalogs((current) => ({ ...current, [section]: value })),
  };
};
