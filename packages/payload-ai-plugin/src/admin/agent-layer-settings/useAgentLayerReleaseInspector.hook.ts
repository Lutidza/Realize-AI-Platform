/**
 * @file packages/payload-ai-plugin/src/admin/agent-layer-settings/useAgentLayerReleaseInspector.hook.ts
 * @version 1.1.0
 * @date 2026-09-11
 * @description Сохраняет поиск выпуска при просмотре записей и переходах по его связям.
 */
"use client";
import { useEffect, useRef, useState } from "react";
import type {
  AIConfigArtifact,
  AIConfigReleaseDTO,
} from "@realize/ai-contracts";
import type { AgentLayerCatalogState } from "./AgentLayerCatalog.types";
import type { AIConfigurationArtifactLink } from "../RealizeAILinks.types";

export const useAgentLayerReleaseInspector = (
  release: AIConfigReleaseDTO,
  initialArtifact?: AIConfigurationArtifactLink,
) => {
  const [selected, setSelected] = useState<AIConfigArtifact | undefined>(
    () =>
      release.artifacts.find(
        ({ artifact }) =>
          artifact.kind === initialArtifact?.kind &&
          artifact.key === initialArtifact.key,
      )?.artifact,
  );
  const [catalog, setCatalog] = useState<AgentLayerCatalogState>({
    search: "",
    status: "all",
    usage: "all",
    sort: "title",
    page: 1,
  });
  const artifacts = release.artifacts.map((snapshot) => snapshot.artifact);
  const contentRef = useRef<HTMLDivElement>(null);
  const identity = selected ? `${selected.kind}:${selected.key}` : "catalog";
  const previous = useRef(identity);
  useEffect(() => {
    if (previous.current === identity) return;
    previous.current = identity;
    const heading = contentRef.current?.querySelector<HTMLHeadingElement>("h2");
    if (heading) {
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    }
  }, [identity]);
  return {
    contentRef,
    selected,
    missingTarget: Boolean(
      initialArtifact &&
      !artifacts.some(
        (artifact) =>
          artifact.kind === initialArtifact.kind &&
          artifact.key === initialArtifact.key,
      ),
    ),
    select: setSelected,
    catalog,
    setCatalog,
    artifacts,
    back: () => setSelected(undefined),
  };
};
