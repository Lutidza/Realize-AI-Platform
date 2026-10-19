/**
 * @file .ai/tools/task-workspace/src/remote/RemoteWorkspace.types.ts
 * @version 1.1.0
 * @date 2026-10-19
 * @description Определяет локальный журнал передачи владения задачей и безопасный вывод маршрутизации.
 * @see documentation/specifications/task-management-execution.md
 */
import type { z } from "zod";
import type { remoteWorkspaceRecordSchema } from "./remoteWorkspaceRecord.validator.mjs";
import type {
  TaskWorkspaceCreateInput,
  TaskWorkspaceCreateResult,
} from "@realize/payload-task-manager/contracts";

export type RemoteWorkspaceRecord = z.infer<typeof remoteWorkspaceRecordSchema>;
export type RemoteWorkspaceTarget = NonNullable<
  RemoteWorkspaceRecord["target"]
>;
export type RemoteWorkspaceConfig = {
  baseUrl: string;
  token: string;
} | null;
export type RemoteWorkspaceTransportResult =
  | { kind: "success"; data: TaskWorkspaceCreateResult }
  | { kind: "unavailable" | "pending" | "rejected"; reason: string };
export type RemoteWorkspaceTransport = (
  config: NonNullable<RemoteWorkspaceConfig>,
  payload: TaskWorkspaceCreateInput,
) => Promise<RemoteWorkspaceTransportResult>;
export type RemoteWorkspaceSelection = NonNullable<
  RemoteWorkspaceRecord["selection"]
>;
export type RemoteWorkspacePreflight = (
  config: NonNullable<RemoteWorkspaceConfig>,
  selection: RemoteWorkspaceSelection,
) => Promise<
  | { kind: "ready"; reason: null; target: RemoteWorkspaceTarget }
  | { kind: "unavailable" | "rejected"; reason: string }
>;

/** Содержит только идентификаторы и причину; credentials и исходный запрос не выдаются. */
export type RemoteWorkspacePresentation = {
  backend: "local" | "task_manager";
  ownership: "local" | "pending" | "remote";
  binding: {
    phase: RemoteWorkspaceRecord["phase"];
    clientTaskId: string;
    selection: RemoteWorkspaceSelection | null;
    taskRef: RemoteWorkspaceRecord["taskRef"];
  } | null;
  reason: string | null;
};
