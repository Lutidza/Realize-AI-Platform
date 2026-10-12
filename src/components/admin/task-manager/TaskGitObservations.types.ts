/**
 * @file src/components/admin/task-manager/TaskGitObservations.types.ts
 * @version 1.1.0
 * @date 2026-10-12
 * @description Описывает клиентское состояние чтения Git для конкретной ревизии задачи.
 * @see documentation/specifications/task-management-execution.md
 */
import type {
  TaskDto,
  TaskGitObservationsDto,
  TaskParticipantDto,
} from "@realize/payload-task-manager/contracts";

export type TaskGitObservationsProps = {
  task: TaskDto;
  participants: TaskParticipantDto[];
};
export type TaskGitObservationState = {
  taskId: string;
  revision: number;
  data: TaskGitObservationsDto | null;
  error: string;
  loading: boolean;
};
