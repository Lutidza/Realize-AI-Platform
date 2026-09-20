/**
 * @file src/components/admin/task-manager/reference/taskLocationAppearance.ts
 * @version 1.0.0
 * @date 2026-09-18
 * @description Выбирает единые иконку, цвет и аватарку контейнера для пути и навигации.
 * @see documentation/architecture/system-admin-shell.md
 */
import { Folder, FolderKanban, Layers, List } from "lucide-react";
import type { UiBadgeAccent } from "@realize/ui-kit";
import type { PrototypeState, TaskLocation } from "./taskManager.types";
import { getLocationInfo } from "./taskManager.hierarchy";
import { workspaceIcons } from "./taskWorkspace.constants";

const locationIcons = {
  workspace: Layers,
  project: FolderKanban,
  folder: Folder,
  list: List,
};
const locationAccents: Record<TaskLocation["kind"], UiBadgeAccent> = {
  workspace: "purple",
  project: "blue",
  folder: "amber",
  list: "cyan",
};

export function getTaskLocationAppearance(
  state: PrototypeState,
  location: TaskLocation,
) {
  const info = getLocationInfo(state, location);
  const workspace =
    location.kind === "workspace"
      ? state.workspaces.find((item) => item.id === location.id)
      : undefined;
  return {
    label: info?.name ?? "",
    imageSrc: info?.avatar,
    accent: workspace?.color ?? locationAccents[location.kind],
    Icon: workspace
      ? workspaceIcons[workspace.icon]
      : locationIcons[location.kind],
  };
}
