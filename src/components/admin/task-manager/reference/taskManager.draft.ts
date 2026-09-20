/**
 * @file src/components/admin/task-manager/reference/taskManager.draft.ts
 * @version 1.1.0
 * @date 2026-09-18
 * @description Создаёт независимые черновики всех редактируемых полей задачи.
 * @see documentation/specifications/task-management-execution.md
 */

import type { PrototypeTask, TaskDraft } from "./taskManager.types";

/** Новый черновик не создаёт задачу, связанные объекты или заявку на выполнение. */
export function createTaskDraft(
  projectId: string,
  parentId?: string,
  listId = `l-${projectId}`,
): TaskDraft {
  return {
    projectId,
    listId,
    title: "",
    description: "",
    status: "backlog",
    priority: "normal",
    taskType: "task",
    parentId: parentId ?? null,
    startDate: "",
    dueDate: "",
    estimateMinutes: null,
    roles: { requester: ["gio"], executor: [], tester: [], observer: [] },
    coexecutorIds: [],
    tags: [],
    workflow: "Задание → выполнение → проверка",
    profile: "frontend.interface-designer",
    mode: "staged",
    dependsOn: [],
    related: [],
    conversationIds: [],
    criteria: [],
    checklists: [],
    gitLinks: [],
  };
}

/** Выбирает только редактируемые поля; состояние run, история и артефакты не входят в форму. */
export function taskToDraft(task: PrototypeTask): TaskDraft {
  return structuredClone({
    projectId: task.projectId,
    listId: task.listId,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    taskType: task.taskType,
    parentId: task.parentId,
    startDate: task.startDate,
    dueDate: task.dueDate,
    estimateMinutes: task.estimateMinutes,
    roles: task.roles,
    coexecutorIds: task.coexecutorIds,
    tags: task.tags,
    workflow: task.workflow,
    profile: task.profile,
    mode: task.mode,
    dependsOn: task.dependsOn,
    related: task.related,
    conversationIds: task.conversationIds,
    criteria: task.criteria,
    checklists: task.checklists,
    gitLinks: task.gitLinks,
  });
}

export function normalizeTaskDraft(draft: TaskDraft): TaskDraft {
  return {
    ...structuredClone(draft),
    title: draft.title.trim(),
    tags: [...new Set(draft.tags.map((tag) => tag.trim()).filter(Boolean))],
    coexecutorIds: [...new Set(draft.coexecutorIds)],
    roles: {
      requester: [...new Set(draft.roles.requester)],
      executor: [...new Set(draft.roles.executor)],
      tester: [...new Set(draft.roles.tester)],
      observer: [...new Set(draft.roles.observer)],
    },
    dependsOn: [...new Set(draft.dependsOn)],
    related: [...new Set(draft.related)],
    conversationIds: [...new Set(draft.conversationIds)],
    criteria: draft.criteria.map((item) => ({
      ...item,
      title: item.title.trim(),
    })),
    checklists: draft.checklists.map((list) => ({
      ...list,
      title: list.title.trim(),
      items: list.items.map((item) => ({ ...item, title: item.title.trim() })),
    })),
    gitLinks: draft.gitLinks.map((link) => ({
      ...link,
      label: link.label.trim(),
      url: link.url.trim(),
      repository: link.repository.trim(),
      revision: link.revision.trim(),
    })),
  };
}
