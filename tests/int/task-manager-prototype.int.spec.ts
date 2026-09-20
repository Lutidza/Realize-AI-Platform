/**
 * @file tests/int/task-manager-prototype.int.spec.ts
 * @version 2.1.1
 * @date 2026-09-18
 * @description Проверяет инварианты связей, передачи ответственности и демонстрационной очереди задач.
 * @see documentation/specifications/task-management.md
 */

import { describe, expect, it } from "vitest";
import { initialPrototypeState } from "../../src/components/admin/task-manager/reference/taskManager.fixtures";
import { createTaskDraft } from "../../src/components/admin/task-manager/reference/taskManager.draft";
import { prototypeReducer } from "../../src/components/admin/task-manager/reference/taskManager.reducer";
import type {
  PrototypeAction,
  PrototypeState,
} from "../../src/components/admin/task-manager/reference/taskManager.types";

function scenario(...ids: string[]): PrototypeState {
  const state = structuredClone(initialPrototypeState);
  state.tasks = state.tasks
    .filter((task) => ids.includes(task.id))
    .map((task) => ({
      ...task,
      status: "ready",
      dependsOn: [],
      related: [],
      parentId: null,
      handoff: undefined,
      roles: { ...task.roles, executor: ["developer"] },
      coexecutorIds: [],
      run: { state: "idle", attempt: 0 },
    }));
  return state;
}

function get(state: PrototypeState, id: string) {
  const task = state.tasks.find((task) => task.id === id);
  if (!task) throw new Error(`Нет тестовой задачи ${id}`);
  return task;
}

describe("Демонстрационная модель task manager", () => {
  it("создаёт независимые проекты и задачи, сброс не меняет исходные fixtures", () => {
    const source = structuredClone(initialPrototypeState);
    let state = prototypeReducer(source, {
      type: "hierarchy/create",
      location: {
        kind: "project",
        workspaceId: "w-realize",
      },
      name: "  Новый проект  ",
      description: "Работа команды",
    });
    const project = state.projects.at(-1)!;
    expect(project.name).toBe("Новый проект");
    state = prototypeReducer(state, {
      type: "task/create",
      draft: { ...createTaskDraft(project.id), title: "  Новое задание  " },
    });
    expect(state.tasks.at(-1)).toMatchObject({
      id: "TM-115",
      title: "Новое задание",
      projectId: project.id,
    });
    expect(state.tasks.at(-1)!.artifacts[0].path).toBe("TASK.md");
    expect(source).toEqual(initialPrototypeState);
    const reset = prototypeReducer(state, { type: "reset" });
    reset.tasks[0].title = "Локальное изменение";
    expect(initialPrototypeState.tasks[0].title).not.toBe(
      "Локальное изменение",
    );
  });

  it("создаёт задачу в выбранной группе и не позволяет сразу подделать выполнение или приёмку", () => {
    const source = scenario("TM-103");
    const base = {
      type: "task/create" as const,
      draft: { ...createTaskDraft("p-realize"), title: "Контекст группы" },
    };
    expect(prototypeReducer(source, base).tasks.at(-1)?.status).toBe("backlog");
    expect(
      prototypeReducer(source, {
        ...base,
        draft: { ...base.draft, status: "backlog" },
      }).tasks.at(-1)?.status,
    ).toBe("backlog");
    const ready = prototypeReducer(source, {
      ...base,
      draft: { ...base.draft, status: "ready" },
    });
    expect(ready.tasks.at(-1)).toMatchObject({
      status: "ready",
      run: { state: "idle", attempt: 0 },
    });
    for (const status of ["in_progress", "review", "done", "invalid"]) {
      const rejected = prototypeReducer(source, {
        ...base,
        draft: { ...base.draft, status },
      } as PrototypeAction);
      expect(rejected.tasks).toEqual(source.tasks);
      expect(rejected.notice).toContain("бэклог или к выполнению");
    }
  });

  it("связанные задачи симметричны, но не становятся блокирующей зависимостью", () => {
    let state = scenario("TM-103", "TM-107");
    state = prototypeReducer(state, {
      type: "task/link",
      taskId: "TM-103",
      targetId: "TM-107",
      kind: "related",
    });
    expect(get(state, "TM-103").related).toEqual(["TM-107"]);
    expect(get(state, "TM-107").related).toEqual(["TM-103"]);
    state = prototypeReducer(state, {
      type: "task/run",
      taskId: "TM-103",
      command: "enqueue",
    });
    expect(get(state, "TM-103").run.state).toBe("running");
    state = prototypeReducer(state, {
      type: "task/link",
      taskId: "TM-107",
      targetId: "TM-103",
      kind: "related",
      remove: true,
    });
    expect(get(state, "TM-103").related).toEqual([]);
    expect(get(state, "TM-107").related).toEqual([]);
  });

  it("допускает зависимости между проектами и отвергает замыкание DAG без частичной записи", () => {
    let state = scenario("TM-103", "TM-107", "TM-111");
    state = prototypeReducer(state, {
      type: "task/link",
      taskId: "TM-103",
      targetId: "TM-107",
      kind: "depends_on",
    });
    state = prototypeReducer(state, {
      type: "task/link",
      taskId: "TM-107",
      targetId: "TM-111",
      kind: "depends_on",
    });
    const before = structuredClone(state.tasks);
    state = prototypeReducer(state, {
      type: "task/link",
      taskId: "TM-111",
      targetId: "TM-103",
      kind: "depends_on",
    });
    expect(state.notice).toContain("цикл");
    expect(state.tasks).toEqual(before);
    expect(get(state, "TM-103").projectId).not.toBe(
      get(state, "TM-107").projectId,
    );
  });

  it("отвязывает один диалог без удаления истории и связей других задач", () => {
    const source = scenario("TM-103", "TM-105");
    expect(get(source, "TM-103").conversationIds).toContain("chat-brief");
    const state = prototypeReducer(source, {
      type: "task/conversation",
      taskId: "TM-103",
      conversationId: "chat-brief",
    });
    expect(get(state, "TM-103").conversationIds).not.toContain("chat-brief");
    expect(get(state, "TM-105").conversationIds).toContain("chat-brief");
    expect(state.conversations).toEqual(source.conversations);
    expect(get(state, "TM-103").activity.at(-1)!.text).toContain("Отвязан");
  });

  it("сохраняет прежнего исполнителя до принятия передачи, затем заменяет его", () => {
    let state = scenario("TM-103");
    state = prototypeReducer(state, {
      type: "task/handoff",
      taskId: "TM-103",
      toActorId: "designer",
      kind: "transfer",
      scope: "Подготовить схему ролей",
    });
    expect(get(state, "TM-103").roles.executor).toEqual(["developer"]);
    expect(get(state, "TM-103").handoff?.state).toBe("pending");
    state = prototypeReducer(state, {
      type: "task/handoff-resolve",
      taskId: "TM-103",
      accept: true,
    });
    expect(get(state, "TM-103").roles.executor).toEqual(["designer"]);
    expect(get(state, "TM-103").handoff?.state).toBe("accepted");
    expect(
      get(state, "TM-103").activity.some((item) =>
        item.text.includes("Назначения сохраняются"),
      ),
    ).toBe(true);
  });

  it("делегирование добавляет соисполнителя, отказ от последующей передачи сохраняет роли", () => {
    let state = scenario("TM-103");
    state = prototypeReducer(state, {
      type: "task/handoff",
      taskId: "TM-103",
      toActorId: "designer",
      kind: "delegate",
      scope: "Подготовить только схему",
    });
    state = prototypeReducer(state, {
      type: "task/handoff-resolve",
      taskId: "TM-103",
      accept: true,
    });
    expect(get(state, "TM-103").roles.executor).toEqual(["developer"]);
    expect(get(state, "TM-103").coexecutorIds).toEqual(["designer"]);
    state = prototypeReducer(state, {
      type: "task/handoff",
      taskId: "TM-103",
      toActorId: "anna",
      kind: "transfer",
      scope: "Принять всю работу",
    });
    state = prototypeReducer(state, {
      type: "task/handoff-resolve",
      taskId: "TM-103",
      accept: false,
    });
    expect(get(state, "TM-103").roles.executor).toEqual(["developer"]);
    expect(get(state, "TM-103").coexecutorIds).toEqual(["designer"]);
    expect(get(state, "TM-103").handoff?.state).toBe("rejected");
  });

  it("повторно проверяет завершённость задачи при принятии ранее предложенной передачи", () => {
    let state = scenario("TM-103");
    state = prototypeReducer(state, {
      type: "task/handoff",
      taskId: "TM-103",
      toActorId: "designer",
      kind: "transfer",
      scope: "Завершить оформление",
    });
    for (const criterion of get(state, "TM-103").criteria)
      state = prototypeReducer(state, {
        type: "task/criterion-toggle",
        taskId: "TM-103",
        itemId: criterion.id,
      });
    state = prototypeReducer(state, {
      type: "task/status",
      taskId: "TM-103",
      status: "done",
    });
    const acceptedWork = structuredClone(get(state, "TM-103"));
    state = prototypeReducer(state, {
      type: "task/handoff-resolve",
      taskId: "TM-103",
      accept: true,
    });
    expect(state.notice).toContain("Переоткройте");
    expect(get(state, "TM-103")).toEqual(acceptedWork);
    state = prototypeReducer(state, {
      type: "task/handoff-resolve",
      taskId: "TM-103",
      accept: false,
    });
    expect(get(state, "TM-103").handoff?.state).toBe("rejected");
    expect(get(state, "TM-103").roles.executor).toEqual(["developer"]);
  });

  it("не дублирует исполнителя в соисполнителях после изменения назначения до принятия handoff", () => {
    let state = scenario("TM-103");
    state = prototypeReducer(state, {
      type: "task/handoff",
      taskId: "TM-103",
      toActorId: "designer",
      kind: "delegate",
      scope: "Подготовить схему",
    });
    state = prototypeReducer(state, {
      type: "task/role",
      taskId: "TM-103",
      role: "executor",
      actorIds: ["developer", "designer"],
    });
    state = prototypeReducer(state, {
      type: "task/handoff-resolve",
      taskId: "TM-103",
      accept: true,
    });
    expect(state.notice).toContain("Получатель уже выполняет");
    expect(get(state, "TM-103").handoff?.state).toBe("pending");
    expect(get(state, "TM-103").roles.executor).toEqual([
      "developer",
      "designer",
    ]);
    expect(get(state, "TM-103").coexecutorIds).toEqual([]);
  });

  it("не меняет исполнителя работающей попытки через handoff или прямую роль", () => {
    let state = scenario("TM-103");
    state = prototypeReducer(state, {
      type: "task/run",
      taskId: "TM-103",
      command: "enqueue",
    });
    state = prototypeReducer(state, {
      type: "task/handoff",
      taskId: "TM-103",
      toActorId: "designer",
      kind: "transfer",
      scope: "Продолжить работу",
    });
    state = prototypeReducer(state, {
      type: "task/handoff-resolve",
      taskId: "TM-103",
      accept: true,
    });
    expect(state.notice).toContain("Остановите");
    expect(get(state, "TM-103").handoff?.state).toBe("pending");
    state = prototypeReducer(state, {
      type: "task/role",
      taskId: "TM-103",
      role: "executor",
      actorIds: [],
    });
    expect(get(state, "TM-103").roles.executor).toEqual(["developer"]);
    expect(get(state, "TM-103").run.state).toBe("running");
  });

  it("выдаёт один слот, не дублирует попытку и после complete передаёт результат на проверку", () => {
    let state = scenario("TM-103", "TM-105");
    state = prototypeReducer(state, {
      type: "task/run",
      taskId: "TM-103",
      command: "enqueue",
    });
    state = prototypeReducer(state, {
      type: "task/run",
      taskId: "TM-105",
      command: "enqueue",
    });
    state = prototypeReducer(state, {
      type: "task/run",
      taskId: "TM-103",
      command: "enqueue",
    });
    expect(get(state, "TM-103").run.attempt).toBe(1);
    expect(get(state, "TM-105").run).toMatchObject({
      state: "queued",
      attempt: 0,
    });
    expect(get(state, "TM-105").run.reason).toContain("TM-103");
    state = prototypeReducer(state, {
      type: "task/run",
      taskId: "TM-103",
      command: "complete",
    });
    expect(get(state, "TM-103")).toMatchObject({
      status: "review",
      run: { state: "succeeded", attempt: 1 },
    });
    expect(get(state, "TM-105").run).toMatchObject({
      state: "running",
      attempt: 1,
    });
    state = prototypeReducer(state, {
      type: "task/comment",
      taskId: "TM-103",
      text: "Проверяем результат",
    });
    expect(get(state, "TM-105").run.attempt).toBe(1);
    expect(
      state.tasks.filter((task) => task.run.state === "running"),
    ).toHaveLength(1);
  });

  it("зависимость освобождает очередь только после Done, а не после успешного запуска", () => {
    let state = scenario("TM-103", "TM-107");
    state = prototypeReducer(state, {
      type: "task/link",
      taskId: "TM-107",
      targetId: "TM-103",
      kind: "depends_on",
    });
    state = prototypeReducer(state, {
      type: "task/run",
      taskId: "TM-107",
      command: "enqueue",
    });
    expect(get(state, "TM-107").run.state).toBe("blocked");
    state = prototypeReducer(state, {
      type: "task/run",
      taskId: "TM-103",
      command: "enqueue",
    });
    state = prototypeReducer(state, {
      type: "task/run",
      taskId: "TM-103",
      command: "complete",
    });
    expect(get(state, "TM-107").run.state).toBe("blocked");
    for (const criterion of get(state, "TM-103").criteria)
      state = prototypeReducer(state, {
        type: "task/criterion-toggle",
        taskId: "TM-103",
        itemId: criterion.id,
      });
    state = prototypeReducer(state, {
      type: "task/status",
      taskId: "TM-103",
      status: "done",
    });
    expect(get(state, "TM-107").run).toMatchObject({
      state: "running",
      attempt: 1,
    });
    expect(get(state, "TM-103").status).toBe("done");
  });

  it("отсутствие AI-исполнителя блокирует заявку; смена ролей согласована с очередью", () => {
    let state = scenario("TM-103", "TM-105");
    state = prototypeReducer(state, {
      type: "task/role",
      taskId: "TM-103",
      role: "executor",
      actorIds: ["anna"],
    });
    state = prototypeReducer(state, {
      type: "task/run",
      taskId: "TM-103",
      command: "enqueue",
    });
    expect(get(state, "TM-103").run.state).toBe("blocked");
    expect(get(state, "TM-103").run.reason).toContain("Назначьте агента");
    state = prototypeReducer(state, {
      type: "task/role",
      taskId: "TM-103",
      role: "executor",
      actorIds: ["planner"],
    });
    expect(get(state, "TM-103").run.state).toBe("running");
    state = prototypeReducer(state, {
      type: "task/run",
      taskId: "TM-105",
      command: "enqueue",
    });
    state = prototypeReducer(state, {
      type: "task/role",
      taskId: "TM-105",
      role: "executor",
      actorIds: [],
    });
    expect(get(state, "TM-105").run.state).toBe("blocked");
    state = prototypeReducer(state, {
      type: "task/run",
      taskId: "TM-103",
      command: "complete",
    });
    expect(get(state, "TM-105").run.attempt).toBe(0);
    state = prototypeReducer(state, {
      type: "task/role",
      taskId: "TM-105",
      role: "executor",
      actorIds: ["developer"],
    });
    expect(get(state, "TM-105").run).toMatchObject({
      state: "running",
      attempt: 1,
    });
  });

  it("не принимает задачу с незавершёнными критериями, зависимостью или активным запуском", () => {
    let state = scenario("TM-103", "TM-107");
    state = prototypeReducer(state, {
      type: "task/status",
      taskId: "TM-103",
      status: "done",
    });
    expect(state.notice).toContain("критерии");
    for (const criterion of get(state, "TM-103").criteria)
      state = prototypeReducer(state, {
        type: "task/criterion-toggle",
        taskId: "TM-103",
        itemId: criterion.id,
      });
    state = prototypeReducer(state, {
      type: "task/link",
      taskId: "TM-103",
      targetId: "TM-107",
      kind: "depends_on",
    });
    state = prototypeReducer(state, {
      type: "task/status",
      taskId: "TM-103",
      status: "done",
    });
    expect(state.notice).toContain("зависимостей");
    state = prototypeReducer(state, {
      type: "task/link",
      taskId: "TM-103",
      targetId: "TM-107",
      kind: "depends_on",
      remove: true,
    });
    state = prototypeReducer(state, {
      type: "task/run",
      taskId: "TM-103",
      command: "enqueue",
    });
    state = prototypeReducer(state, {
      type: "task/status",
      taskId: "TM-103",
      status: "done",
    });
    expect(get(state, "TM-103").status).toBe("in_progress");
  });

  it("pause/cancel освобождают слот, terminal не перезапускается без явного retry", () => {
    let state = scenario("TM-103", "TM-105");
    state = prototypeReducer(state, {
      type: "task/run",
      taskId: "TM-103",
      command: "enqueue",
    });
    state = prototypeReducer(state, {
      type: "task/run",
      taskId: "TM-105",
      command: "enqueue",
    });
    state = prototypeReducer(state, {
      type: "task/run",
      taskId: "TM-103",
      command: "pause",
    });
    expect(get(state, "TM-103").run.state).toBe("paused");
    expect(get(state, "TM-105").run.state).toBe("running");
    state = prototypeReducer(state, {
      type: "task/run",
      taskId: "TM-103",
      command: "resume",
    });
    expect(get(state, "TM-103").run).toMatchObject({
      state: "queued",
      attempt: 1,
    });
    state = prototypeReducer(state, {
      type: "task/run",
      taskId: "TM-105",
      command: "cancel",
    });
    expect(get(state, "TM-103").run).toMatchObject({
      state: "running",
      attempt: 2,
    });
    state = prototypeReducer(state, {
      type: "task/run",
      taskId: "TM-103",
      command: "fail",
    });
    state = prototypeReducer(state, {
      type: "task/comment",
      taskId: "TM-103",
      text: "Причина сбоя уточнена",
    });
    expect(state.tasks.some((task) => task.run.state === "running")).toBe(
      false,
    );
    state = prototypeReducer(state, {
      type: "task/run",
      taskId: "TM-103",
      command: "retry",
    });
    expect(get(state, "TM-103").run).toMatchObject({
      state: "running",
      attempt: 3,
    });
    expect(get(state, "TM-105").run.state).toBe("cancelled");
  });
});
