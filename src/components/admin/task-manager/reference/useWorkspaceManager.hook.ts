/**
 * @file src/components/admin/task-manager/reference/useWorkspaceManager.hook.ts
 * @version 1.0.0
 * @date 2026-09-18
 * @description Связывает экраны сред, защиту черновика и команды управления в общем workbench.
 * @see documentation/specifications/task-management.md
 */

import { useEffect, useRef, useState } from "react";
import { getWorkspaceDraft } from "./taskWorkspace.access";
import { useWorkspaceComposer } from "./useWorkspaceComposer.hook";
import type { PrototypeDispatch, PrototypeState } from "./taskManager.types";
import type { WorkspaceTab } from "./taskWorkspace.types";
import type { WorkspaceNavigation } from "./WorkspaceViews.types";

export function useWorkspaceManager(
  state: PrototypeState,
  dispatch: PrototypeDispatch,
  selectWorkspace: (id: string) => void,
) {
  const [screen, setScreen] = useState<"tasks" | "catalog" | "settings">(
    "tasks",
  );
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [tab, setTab] = useState<WorkspaceTab>("general");
  const [revision, setRevision] = useState(0);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const pending = useRef<WorkspaceNavigation | null>(null);
  const workspace = state.workspaces.find((entry) => entry.id === workspaceId);
  const composer = useWorkspaceComposer((draft) => {
    const result = dispatch({
      type: "workspace/save",
      workspaceId: workspaceId ?? "",
      expectedRevision: revision,
      draft,
    });
    if (result.ok) {
      setRevision((value) => value + 1);
      setNotice(result.message);
    }
    return result;
  });
  const dirty = screen === "settings" && composer.dirty;
  useEffect(() => {
    if (!dirty) return;
    const prevent = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [dirty]);
  const navigate = (target: WorkspaceNavigation, saved = false) => {
    if (target.kind === "action") {
      target.run();
      return;
    }
    const selected = state.workspaces.find((entry) => entry.id === target.id);
    if (!selected) return;
    selectWorkspace(target.id);
    setWorkspaceId(target.id);
    // Успешный save уже загрузил нормализованный черновик и увеличил revision.
    // В том же событии React ещё может предоставлять предыдущий снимок store.
    if (!saved || target.id !== workspaceId) {
      setRevision(selected.revision);
      composer.load(getWorkspaceDraft(selected));
    }
    setTab(target.tab);
    setScreen("settings");
    setNotice("");
  };
  const request = (target: WorkspaceNavigation) => {
    if (dirty) {
      pending.current = target;
      setLeaveOpen(true);
    } else navigate(target);
  };
  const requestNavigation = (action: () => void) =>
    request({ kind: "action", run: action });
  const completeNavigation = (saved = false) => {
    const next = pending.current;
    pending.current = null;
    setLeaveOpen(false);
    if (next) navigate(next, saved);
  };
  return {
    screen,
    workspace,
    tab,
    composer,
    notice,
    leaveOpen,
    archiveOpen,
    requestNavigation,
    openTasks: (action: () => void) =>
      requestNavigation(() => {
        setScreen("tasks");
        action();
      }),
    openCatalog: () =>
      requestNavigation(() => {
        setScreen("catalog");
        setNotice("");
      }),
    openSettings: (id: string, nextTab: WorkspaceTab = "general") =>
      request({ kind: "settings", id, tab: nextTab }),
    changeTab: (nextTab: WorkspaceTab) => {
      if (workspace && nextTab !== tab)
        request({ kind: "settings", id: workspace.id, tab: nextTab });
    },
    reload: () => {
      if (workspace) {
        setRevision(workspace.revision);
        composer.load(getWorkspaceDraft(workspace));
      }
    },
    cancelLeave: () => {
      pending.current = null;
      setLeaveOpen(false);
    },
    discardAndLeave: () => {
      composer.reset();
      completeNavigation();
    },
    saveAndLeave: () => {
      if (composer.save().ok) completeNavigation(true);
      else setLeaveOpen(false);
    },
    setArchiveOpen,
    archive: (archived: boolean) => {
      if (!workspace) return;
      const result = dispatch({
        type: "workspace/archive",
        workspaceId: workspace.id,
        expectedRevision: workspace.revision,
        archived,
      });
      setNotice(result.message);
      if (result.ok) {
        setArchiveOpen(false);
        setRevision(workspace.revision + 1);
      }
    },
  };
}
