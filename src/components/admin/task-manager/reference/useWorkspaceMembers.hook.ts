/**
 * @file src/components/admin/task-manager/reference/useWorkspaceMembers.hook.ts
 * @version 1.0.0
 * @date 2026-09-18
 * @description Управляет выбором участника и атомарным изменением его доступа к среде.
 * @see documentation/specifications/task-management.md
 */

import { useState } from "react";
import type { WorkspaceMembersProps } from "./WorkspaceViews.types";
import type { WorkspaceMemberRole } from "./taskWorkspace.types";

export function useWorkspaceMembers({
  workspace,
  dispatch,
  actors,
}: Pick<WorkspaceMembersProps, "workspace" | "dispatch" | "actors">) {
  const [actorId, setActorId] = useState("");
  const [role, setRole] = useState<WorkspaceMemberRole>("member");
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const available = actors.filter(
    (actor) =>
      actor.id !== workspace.ownerId &&
      !workspace.members.some((entry) => entry.actorId === actor.id),
  );
  const update = (id: string, nextRole: WorkspaceMemberRole | null) => {
    const result = dispatch({
      type: "workspace/member",
      workspaceId: workspace.id,
      expectedRevision: workspace.revision,
      actorId: id,
      role: nextRole,
    });
    setMessage(result.message);
    setError(!result.ok);
    if (result.ok) setActorId("");
  };
  return {
    actorId,
    setActorId,
    role,
    setRole,
    message,
    error,
    available,
    update,
    add: () => update(actorId, role),
  };
}
