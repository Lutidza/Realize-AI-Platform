/**
 * @file tests/int/task-manager-commands.int.spec.ts
 * @version 1.0.2
 * @date 2026-09-20
 * @description Проверяет атомарность полного редактора, дерева задач, архива и реактивного store.
 * @see documentation/specifications/task-management-execution.md
 */
import { describe, expect, it, vi } from "vitest";
import { initialPrototypeState } from "../../src/components/admin/task-manager/reference/taskManager.fixtures";
import {
  createTaskDraft,
  taskToDraft,
} from "../../src/components/admin/task-manager/reference/taskManager.draft";
import { prototypeReducer } from "../../src/components/admin/task-manager/reference/taskManager.reducer";
import { createPrototypeStore } from "../../src/components/admin/task-manager/reference/taskManager.store";
import { validateTaskDraft } from "../../src/components/admin/task-manager/reference/taskManager.validation";
import type {
  GitLink,
  PrototypeState,
  TaskDraft,
} from "../../src/components/admin/task-manager/reference/taskManager.types";

// Синтетический userinfo создаётся в памяти для проверки запрета credentials.
const credentialedUrl = new URL("https://example.com/commit");
credentialedUrl.username = "fixture-user";
credentialedUrl.password = "fixture-password";

function scenario(): PrototypeState {
  const state = structuredClone(initialPrototypeState);
  state.tasks = state.tasks
    .filter((task) => ["TM-103", "TM-104", "TM-107"].includes(task.id))
    .map((task) => ({
      ...task,
      status: "ready",
      parentId: null,
      dependsOn: [],
      related: [],
      criteria: [],
      checklists: [],
      gitLinks: [],
      run: { state: "idle", attempt: 0 },
      handoff: undefined,
    }));
  return state;
}
const get = (state: PrototypeState, id = "TM-103") =>
  state.tasks.find((task) => task.id === id)!;
const link: GitLink = {
  id: "commit-1",
  kind: "commit",
  label: "Изменение формы",
  url: "https://example.com/project/commit/abcdef1",
  repository: "demo/project",
  revision: "abcdef1",
  source: "manual",
  status: "unverified",
};
function fullDraft(): TaskDraft {
  return {
    ...createTaskDraft("p-realize"),
    title: "  Полное задание  ",
    description: "Согласованное описание",
    status: "ready",
    taskType: "bug",
    priority: "urgent",
    startDate: "2026-09-17",
    dueDate: "2026-09-22",
    estimateMinutes: 120,
    roles: {
      requester: ["gio", "planner"],
      executor: ["developer", "designer"],
      tester: ["tester"],
      observer: ["anna"],
    },
    coexecutorIds: ["planner"],
    tags: ["UX", " UX ", "Проверка"],
    workflow: "Проверка → исправление",
    profile: "frontend.interface-designer",
    mode: "manual",
    parentId: "TM-103",
    dependsOn: ["TM-107"],
    related: ["TM-104"],
    conversationIds: ["chat-design"],
    criteria: [{ id: "criterion-1", title: "Проверено вручную", done: false }],
    checklists: [
      {
        id: "list-1",
        title: "Проверки",
        items: [
          {
            id: "item-1",
            title: " Проверить форму ",
            done: false,
            assigneeId: "tester",
            dueDate: "2026-09-20",
            required: true,
          },
        ],
      },
    ],
    gitLinks: [link],
  };
}

describe("Полные команды второго референса task manager", () => {
  it("fixtures соответствуют инвариантам полного редактора", () => {
    for (const task of initialPrototypeState.tasks) {
      expect(
        validateTaskDraft(initialPrototypeState, taskToDraft(task), task.id),
        task.id,
      ).toEqual({});
    }
    expect(
      initialPrototypeState.tasks.filter(
        (task) => task.run.state === "running",
      ),
    ).toHaveLength(1);
  });
  it("создаёт все поля одной командой, симметричные связи и независимый снимок", () => {
    const source = scenario();
    const draft = fullDraft();
    const state = prototypeReducer(source, { type: "task/create", draft });
    expect(state.lastResult).toMatchObject({ ok: true, taskId: "TM-108" });
    const task = get(state, "TM-108");
    expect(taskToDraft(task)).toEqual({
      ...draft,
      title: "Полное задание",
      tags: ["UX", "Проверка"],
      checklists: [
        {
          ...draft.checklists[0],
          items: [
            { ...draft.checklists[0].items[0], title: "Проверить форму" },
          ],
        },
      ],
    });
    expect(get(state, "TM-104").related).toEqual(["TM-108"]);
    expect(task.run).toEqual({ state: "idle", attempt: 0 });
    expect(task.artifacts.map((item) => item.path)).toEqual(["TASK.md"]);
    draft.roles.executor.push("anna");
    expect(task.roles.executor).toEqual(["developer", "designer"]);
    expect(source.tasks).toHaveLength(3);
  });

  it("ошибка последнего поля не оставляет задачу, обратную связь, историю или продвижение очереди", () => {
    const source = scenario();
    get(source).run = { state: "queued", attempt: 0 };
    const draft = fullDraft();
    draft.gitLinks[0] = { ...link, url: "javascript:alert(1)" };
    const result = prototypeReducer(source, { type: "task/create", draft });
    expect(result.lastResult.ok).toBe(false);
    expect(result.lastResult.fieldErrors).toHaveProperty("gitLinks.0.url");
    expect(result.tasks).toBe(source.tasks);
    expect(get(result).run.state).toBe("queued");
  });

  it("полное редактирование удаляет и создаёт симметричные related-связи атомарно", () => {
    let state = scenario();
    state = prototypeReducer(state, {
      type: "task/link",
      taskId: "TM-103",
      targetId: "TM-104",
      kind: "related",
    });
    const draft = taskToDraft(get(state));
    draft.title = "Новое название";
    draft.related = ["TM-107"];
    state = prototypeReducer(state, {
      type: "task/save",
      taskId: "TM-103",
      draft,
    });
    expect(state.lastResult.ok).toBe(true);
    expect(get(state).title).toBe("Новое название");
    expect(get(state, "TM-104").related).toEqual([]);
    expect(get(state, "TM-107").related).toEqual(["TM-103"]);
    const invalid = {
      ...taskToDraft(get(state)),
      title: "Не должно сохраниться",
      dependsOn: ["missing"],
    };
    const rejected = prototypeReducer(state, {
      type: "task/save",
      taskId: "TM-103",
      draft: invalid,
    });
    expect(rejected.lastResult.ok).toBe(false);
    expect(rejected.tasks).toEqual(state.tasks);
  });

  it("checklist хранит порядок и назначения, обязательные пункты и criteria отдельно блокируют принятие", () => {
    let state = scenario();
    const draft = taskToDraft(get(state));
    draft.criteria = [{ id: "criterion-1", title: "Критерий", done: false }];
    draft.checklists = [
      {
        id: "list-1",
        title: "Приёмка",
        items: [
          {
            id: "item-1",
            title: "Клавиатура",
            done: false,
            assigneeId: "tester",
            dueDate: "2026-09-20",
            required: true,
          },
        ],
      },
      {
        id: "list-2",
        title: "Дополнительно",
        items: [
          {
            id: "item-2",
            title: "Идеи",
            done: false,
            assigneeId: null,
            dueDate: "",
            required: false,
          },
        ],
      },
    ];
    state = prototypeReducer(state, {
      type: "task/save",
      taskId: "TM-103",
      draft,
    });
    let rejected = prototypeReducer(state, {
      type: "task/status",
      taskId: "TM-103",
      status: "done",
    });
    expect(rejected.notice).toContain("критерии");
    state = prototypeReducer(state, {
      type: "task/criterion-toggle",
      taskId: "TM-103",
      itemId: "criterion-1",
    });
    rejected = prototypeReducer(state, {
      type: "task/status",
      taskId: "TM-103",
      status: "done",
    });
    expect(rejected.notice).toContain("чеклистов");
    const checklists = structuredClone(get(state).checklists).reverse();
    checklists[1].items[0].done = true;
    state = prototypeReducer(state, {
      type: "task/checklists",
      taskId: "TM-103",
      checklists,
    });
    expect(get(state).checklists.map((list) => list.id)).toEqual([
      "list-2",
      "list-1",
    ]);
    state = prototypeReducer(state, {
      type: "task/status",
      taskId: "TM-103",
      status: "done",
    });
    expect(state.lastResult.ok).toBe(true);
    expect(get(state).checklists[0].items[0].done).toBe(false);
    rejected = prototypeReducer(state, {
      type: "task/checklists",
      taskId: "TM-103",
      checklists: [],
    });
    expect(rejected.lastResult.ok).toBe(false);
    expect(rejected.tasks).toEqual(state.tasks);
  });

  it("даты, оценка, дубли ID и неизвестный участник проверяются до изменения", () => {
    const state = scenario();
    const draft = fullDraft();
    draft.startDate = "2026-02-30";
    draft.dueDate = "2026-01-01";
    draft.estimateMinutes = -1;
    draft.checklists[0].items[0].id = "criterion-1";
    draft.checklists[0].items[0].assigneeId = "missing";
    const errors = validateTaskDraft(state, draft);
    expect(errors).toHaveProperty("startDate");
    expect(errors).toHaveProperty("dueDate");
    expect(errors).toHaveProperty("estimateMinutes");
    expect(errors).toHaveProperty("checklists.0.items.0.id");
    expect(errors).toHaveProperty("checklists.0.items.0.assigneeId");
  });

  it.each([
    "javascript:alert(1)",
    "data:text/html,hello",
    "/local/commit",
    credentialedUrl.href,
  ])("отвергает небезопасную Git-ссылку %s", (url) => {
    const source = scenario();
    const state = prototypeReducer(source, {
      type: "task/git-links",
      taskId: "TM-103",
      gitLinks: [{ ...link, url }],
    });
    expect(state.lastResult.ok).toBe(false);
    expect(state.tasks).toEqual(source.tasks);
  });

  it("ручная Git-ссылка не выдаёт success, демонстрационный источник не изображает provider receipt", () => {
    const source = scenario();
    const rejected = prototypeReducer(source, {
      type: "task/git-links",
      taskId: "TM-103",
      gitLinks: [{ ...link, status: "succeeded" }],
    });
    expect(rejected.notice).toContain("Ручная ссылка");
    const manual = prototypeReducer(source, {
      type: "task/git-links",
      taskId: "TM-103",
      gitLinks: [link],
    });
    expect(get(manual).gitLinks[0]).toMatchObject({
      source: "manual",
      status: "unverified",
    });
    const demo = prototypeReducer(source, {
      type: "task/git-links",
      taskId: "TM-103",
      gitLinks: [
        {
          ...link,
          label: "Демо: образец",
          source: "demo",
          status: "succeeded",
        },
      ],
    });
    expect(get(demo).gitLinks[0].source).toBe("demo");
  });

  it("родитель, дочерние задачи и dependencies образуют единый ацикличный граф ожидания", () => {
    const source = scenario();
    const child = get(source, "TM-104");
    child.parentId = "TM-103";
    let draft = taskToDraft(get(source));
    draft.parentId = child.id;
    expect(
      prototypeReducer(source, { type: "task/save", taskId: "TM-103", draft })
        .lastResult.ok,
    ).toBe(false);
    draft = taskToDraft(child);
    draft.dependsOn = ["TM-103"];
    const cycle = prototypeReducer(source, {
      type: "task/save",
      taskId: child.id,
      draft,
    });
    expect(cycle.notice).toContain("цикл");
    draft = taskToDraft(child);
    draft.projectId = "p-content";
    draft.listId = "l-p-content";
    const project = prototypeReducer(source, {
      type: "task/save",
      taskId: child.id,
      draft,
    });
    expect(project.notice).toContain("того же проекта");
    const blocked = prototypeReducer(source, {
      type: "task/status",
      taskId: "TM-103",
      status: "done",
    });
    expect(blocked.notice).toContain("подзадачи");
  });

  it("не переоткрывает принятого ребёнка под принятым родителем", () => {
    const source = scenario();
    get(source).status = "done";
    get(source, "TM-104").status = "done";
    get(source, "TM-104").parentId = "TM-103";
    const rejected = prototypeReducer(source, {
      type: "task/status",
      taskId: "TM-104",
      status: "ready",
    });
    expect(rejected.notice).toContain("Переоткройте родителя");
    expect(rejected.tasks).toEqual(source.tasks);
  });

  it("bulk принимает завершённое дерево одной атомарной командой независимо от порядка", () => {
    const source = scenario();
    get(source, "TM-104").parentId = "TM-103";
    const state = prototypeReducer(source, {
      type: "task/bulk",
      taskIds: ["TM-103", "TM-104"],
      operation: "status",
      status: "done",
    });
    expect(state.lastResult.ok).toBe(true);
    expect(get(state).status).toBe("done");
    expect(get(state, "TM-104").status).toBe("done");
    const reopen = prototypeReducer(state, {
      type: "task/bulk",
      taskIds: ["TM-104", "TM-103"],
      operation: "status",
      status: "ready",
    });
    expect(reopen.lastResult.ok).toBe(true);
  });

  it("bulk отказывает полностью при одном незавершённом критерии", () => {
    const source = scenario();
    get(source, "TM-104").criteria = [
      { id: "criterion", title: "Ещё не готово", done: false },
    ];
    const rejected = prototypeReducer(source, {
      type: "task/bulk",
      taskIds: ["TM-103", "TM-104"],
      operation: "status",
      status: "done",
    });
    expect(rejected.lastResult.ok).toBe(false);
    expect(rejected.tasks).toEqual(source.tasks);
  });

  it("архив и восстановление сохраняют дерево и историю; активный запрос блокирует всю группу", () => {
    const source = scenario();
    get(source, "TM-104").parentId = "TM-103";
    expect(
      prototypeReducer(source, {
        type: "task/archive",
        taskId: "TM-103",
        archived: true,
      }).lastResult.ok,
    ).toBe(false);
    let state = prototypeReducer(source, {
      type: "task/bulk",
      taskIds: ["TM-103", "TM-104"],
      operation: "archive",
    });
    expect(state.lastResult.ok).toBe(true);
    expect(get(state).activity.length).toBeGreaterThan(
      get(source).activity.length,
    );
    expect(
      prototypeReducer(state, {
        type: "task/archive",
        taskId: "TM-104",
        archived: false,
      }).lastResult.ok,
    ).toBe(false);
    const unavailable = prototypeReducer(state, {
      type: "task/run",
      taskId: "TM-103",
      command: "enqueue",
    });
    expect(unavailable.lastResult.ok).toBe(false);
    state = prototypeReducer(state, {
      type: "task/bulk",
      taskIds: ["TM-104", "TM-103"],
      operation: "restore",
    });
    expect(state.lastResult.ok).toBe(true);
    state = prototypeReducer(state, {
      type: "task/run",
      taskId: "TM-104",
      command: "enqueue",
    });
    const blocked = prototypeReducer(state, {
      type: "task/bulk",
      taskIds: ["TM-103", "TM-104"],
      operation: "archive",
    });
    expect(blocked.lastResult.ok).toBe(false);
    expect(blocked.tasks).toEqual(state.tasks);
  });

  it("архив не оставляет активную зависимую задачу без незавершённой предпосылки", () => {
    const source = scenario();
    get(source, "TM-107").dependsOn = ["TM-103"];
    expect(
      prototypeReducer(source, {
        type: "task/archive",
        taskId: "TM-103",
        archived: true,
      }).lastResult.ok,
    ).toBe(false);
    const state = prototypeReducer(source, {
      type: "task/bulk",
      taskIds: ["TM-103", "TM-107"],
      operation: "archive",
    });
    expect(state.lastResult.ok).toBe(true);
    expect(
      prototypeReducer(state, {
        type: "task/archive",
        taskId: "TM-107",
        archived: false,
      }).lastResult.ok,
    ).toBe(false);
    const restored = prototypeReducer(state, {
      type: "task/bulk",
      taskIds: ["TM-107", "TM-103"],
      operation: "restore",
    });
    expect(restored.lastResult.ok).toBe(true);
    const draft = createTaskDraft("p-realize");
    draft.title = "Новая зависимая работа";
    draft.dependsOn = ["TM-103"];
    expect(
      prototypeReducer(state, { type: "task/create", draft }).lastResult.ok,
    ).toBe(false);
  });

  it("дубликат не наследует выполненные пункты, историю попыток, передачу или Git-результат", () => {
    const source = scenario();
    const task = get(source);
    task.status = "done";
    task.run = { state: "succeeded", attempt: 3 };
    task.criteria = [{ id: "criterion", title: "Принято", done: true }];
    task.checklists = [
      {
        id: "list",
        title: "Готово",
        items: [
          {
            id: "item",
            title: "Проверка",
            done: true,
            assigneeId: "tester",
            dueDate: "",
            required: true,
          },
        ],
      },
    ];
    task.gitLinks = [link];
    task.handoff = {
      state: "accepted",
      toActorId: "designer",
      kind: "transfer",
      scope: "Работа",
    };
    const state = prototypeReducer(source, {
      type: "task/duplicate",
      taskId: "TM-103",
    });
    expect(state.lastResult.ok).toBe(true);
    const copy = get(state, state.lastResult.taskId);
    expect(copy).toMatchObject({
      status: "backlog",
      parentId: null,
      archived: false,
      run: { state: "idle", attempt: 0 },
      gitLinks: [],
    });
    expect(copy.handoff).toBeUndefined();
    expect(copy.criteria[0].done).toBe(false);
    expect(copy.checklists[0].items[0].done).toBe(false);
    expect(copy.criteria[0].id).not.toBe(task.criteria[0].id);
    expect(copy.artifacts.map((item) => item.path)).toEqual(["TASK.md"]);
    expect(get(state)).toEqual(task);
  });

  it("synchronous store возвращает результат до следующей команды и изолирует экземпляры", () => {
    const store = createPrototypeStore(scenario());
    const other = createPrototypeStore(scenario());
    const first = store.getSnapshot();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    const invalid = store.dispatch({
      type: "task/create",
      draft: createTaskDraft("p-realize"),
    });
    expect(invalid.ok).toBe(false);
    expect(store.getSnapshot().tasks).toBe(first.tasks);
    const created = store.dispatch({
      type: "task/create",
      draft: { ...createTaskDraft("p-realize"), title: "Создана один раз" },
    });
    expect(created.ok).toBe(true);
    expect(get(store.getSnapshot(), created.taskId).title).toBe(
      "Создана один раз",
    );
    expect(other.getSnapshot().tasks).toHaveLength(3);
    expect(first.tasks).toHaveLength(3);
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    store.dispatch({
      type: "task/comment",
      taskId: created.taskId!,
      text: "Продолжение",
    });
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
