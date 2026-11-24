/**
 * @file src/components/admin/control-panel-preview/useControlPanelPreview.hook.ts
 * @version 1.1.0
 * @date 2026-11-22
 * @description Управляет preview и URL без загрузки страницы или сохранения назначения.
 * @see documentation/specifications/realize-ai-control-panel-first-release.md
 */
"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { TemplateMode } from "@realize/template-contracts";
import type { ControlPanelLayoutId } from "@realize/template-realizeai-control-panel/manifest";
import type { ControlPanelPreviewState } from "./ControlPanelPreview.types";
import { parseControlPanelPreviewQuery } from "./parseControlPanelPreviewQuery.validator";

/** Состояние живёт выше renderer; browser history меняет только проверенные mode/layout. */
export function useControlPanelPreview(initial: ControlPanelPreviewState) {
  const [state, setState] = useState(initial);
  const current = useRef(initial);
  const [open, setOpen] = useState(false);
  const update = useCallback((patch: Partial<ControlPanelPreviewState>) => {
    const next = { ...current.current, ...patch };
    current.current = next;
    const url = new URL(window.location.href);
    url.searchParams.set("mode", next.mode);
    if (next.layoutId === undefined) url.searchParams.delete("layout");
    else url.searchParams.set("layout", next.layoutId);
    if (url.href !== window.location.href)
      window.history.pushState(null, "", url);
    setState(next);
  }, []);
  useEffect(() => {
    const onPopState = () => {
      const query = new URLSearchParams(window.location.search);
      const one = (key: string) =>
        query.getAll(key).length > 1
          ? query.getAll(key)
          : (query.get(key) ?? undefined);
      const next = parseControlPanelPreviewQuery({
        mode: one("mode"),
        layout: one("layout"),
      });
      if (next) {
        current.current = next;
        setState(next);
      } else window.location.reload();
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);
  const setMode = useCallback(
    (mode: TemplateMode) => update({ mode }),
    [update],
  );
  const setLayoutId = useCallback(
    (layoutId: ControlPanelLayoutId | undefined) => update({ layoutId }),
    [update],
  );
  return { state, open, setOpen, setMode, setLayoutId };
}
