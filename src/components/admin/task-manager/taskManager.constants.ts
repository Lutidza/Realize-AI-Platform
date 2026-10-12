/**
 * @file src/components/admin/task-manager/taskManager.constants.ts
 * @version 1.2.0
 * @date 2026-10-12
 * @description Задаёт названия состояний, приоритетов и недоступности Git в рабочих задачах.
 * @see documentation/specifications/task-management-execution.md
 */
import type {
  TaskEditableFields,
  TaskGitObservationUnavailableReason,
} from "@realize/payload-task-manager/contracts";

export const taskGitCiLabels = {
  queued: "В очереди",
  in_progress: "Выполняется",
  completed: "Завершено",
  waiting: "Ожидает",
  requested: "Запрошено",
  pending: "Ожидает результата",
  action_required: "Требуется действие",
  cancelled: "Отменено",
  failure: "Ошибка",
  neutral: "Нейтрально",
  skipped: "Пропущено",
  stale: "Устарело",
  success: "Успешно",
  timed_out: "Истекло время",
  startup_failure: "Ошибка запуска",
  error: "Ошибка",
};

export const taskGitUnavailableLabels: Record<
  TaskGitObservationUnavailableReason,
  string
> = {
  not_configured: "Подключение GitHub не настроено для чтения.",
  repository_not_allowed:
    "Для этого репозитория пока нет разрешённого подключения.",
  unsupported_sha: "Этот формат SHA пока не поддерживается GitHub.",
  provider_unavailable:
    "GitHub временно недоступен или не разрешил чтение. Повторите проверку.",
  invalid_response:
    "Не удалось подтвердить сведения GitHub. Повторите проверку.",
};

export const taskStatusLabels: Record<TaskEditableFields["status"], string> = {
  backlog: "Бэклог",
  in_progress: "В работе",
  review: "На проверке",
};
export const taskPriorityLabels: Record<
  TaskEditableFields["priority"],
  string
> = {
  low: "Низкий",
  normal: "Обычный",
  high: "Высокий",
  urgent: "Срочный",
};
