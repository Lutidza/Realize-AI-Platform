/**
 * @file tests/int/task-manager-tree.int.spec.ts
 * @version 1.0.0
 * @date 2026-09-18
 * @description Проверяет вложенные строки, поиск подзадач и исключение контекстных родителей из bulk.
 * @see documentation/specifications/task-management.md
 */

import { createElement as h } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getTaskTreeRows } from "../../src/components/admin/task-manager/reference/taskManager.tree";
import { initialPrototypeState } from "../../src/components/admin/task-manager/reference/taskManager.fixtures";
import { TaskViews } from "../../src/components/admin/task-manager/reference/TaskViews.component";

function taskTree() {
  const template = structuredClone(initialPrototypeState.tasks[0]);
  const parent = {
    ...template,
    id: "parent",
    title: "Родитель",
    parentId: null,
    status: "ready" as const,
  };
  const child = {
    ...template,
    id: "child",
    title: "Дочерняя работа",
    parentId: parent.id,
    status: "in_progress" as const,
  };
  const grandchild = {
    ...template,
    id: "grandchild",
    title: "Проверка результата",
    parentId: child.id,
    status: "review" as const,
  };
  return [parent, child, grandchild];
}

afterEach(cleanup);

describe("Дерево подзадач", () => {
  it("сохраняет независимые статусы детей внутри группы корня", () => {
    const tasks = taskTree();
    const rows = getTaskTreeRows(tasks, tasks);
    expect(rows.map((row) => [row.task.id, row.depth, row.rootStatus])).toEqual(
      [
        ["parent", 0, "ready"],
        ["child", 1, "ready"],
        ["grandchild", 2, "ready"],
      ],
    );
    expect(rows[1].task.status).toBe("in_progress");
  });
  it("сворачивание скрывает всю ветку без потери дочерних задач", () => {
    const tasks = taskTree();
    const rows = getTaskTreeRows(tasks, tasks, new Set(["parent"]));
    expect(rows.map((row) => row.task.id)).toEqual(["parent"]);
    expect(rows[0]).toMatchObject({ childCount: 1, expanded: false });
    expect(getTaskTreeRows(tasks, tasks)).toHaveLength(3);
  });
  it("поиск внука восстанавливает цепочку как контекст даже в свёрнутой ветке", () => {
    const tasks = taskTree();
    const rows = getTaskTreeRows(
      [tasks[2]],
      tasks,
      new Set(["parent", "child"]),
      true,
    );
    expect(rows.map((row) => [row.task.id, row.contextOnly])).toEqual([
      ["parent", true],
      ["child", true],
      ["grandchild", false],
    ]);
  });
  it("архив и чужой список не добавляют невидимого родителя в контекст", () => {
    const tasks = taskTree();
    tasks[0].archived = true;
    expect(getTaskTreeRows([tasks[1]], tasks)[0].task.id).toBe("child");
    tasks[0].archived = false;
    tasks[0].listId = "another-list";
    expect(getTaskTreeRows([tasks[1]], tasks)[0].task.id).toBe("child");
  });
  it("поиск подзадачи раскрывает ранее свёрнутую статусную группу вместе с предками", () => {
    const tasks = taskTree();
    const props = {
      tasks,
      allTasks: tasks,
      actors: [],
      view: "list" as const,
      columns: [],
      selected: [],
      onSelect: vi.fn(),
      onOpenTask: vi.fn(),
      onCreate: vi.fn(),
      onCreateSubtask: vi.fn(),
      dispatch: vi.fn(),
      filtered: false,
    };
    const { rerender } = render(h(TaskViews, props));
    fireEvent.click(
      screen.getByRole("button", { name: "Свернуть К выполнению" }),
    );
    expect(
      screen.queryByRole("checkbox", { name: "Выбрать grandchild" }),
    ).toBeNull();

    rerender(h(TaskViews, { ...props, tasks: [tasks[2]], filtered: true }));

    expect(
      screen
        .getByRole("button", { name: "Свернуть К выполнению" })
        .getAttribute("aria-expanded"),
    ).toBe("true");
    for (const id of ["parent", "child", "grandchild"])
      expect(
        screen.getByRole("checkbox", { name: `Выбрать ${id}` }),
      ).toBeTruthy();
    expect(
      (
        screen.getByRole("checkbox", {
          name: "Выбрать parent",
        }) as HTMLInputElement
      ).disabled,
    ).toBe(true);
    expect(
      (
        screen.getByRole("checkbox", {
          name: "Выбрать child",
        }) as HTMLInputElement
      ).disabled,
    ).toBe(true);
    expect(
      (
        screen.getByRole("checkbox", {
          name: "Выбрать grandchild",
        }) as HTMLInputElement
      ).disabled,
    ).toBe(false);
  });
  it("выбор всех результатов не выбирает контекстных родителей", () => {
    const tasks = taskTree();
    const onSelect = vi.fn();
    render(
      h(TaskViews, {
        tasks: [tasks[2]],
        allTasks: tasks,
        actors: [],
        view: "list",
        columns: [],
        selected: [],
        onSelect,
        onOpenTask: vi.fn(),
        onCreate: vi.fn(),
        onCreateSubtask: vi.fn(),
        dispatch: vi.fn(),
        filtered: true,
      }),
    );
    expect(
      (
        screen.getByRole("checkbox", {
          name: "Выбрать parent",
        }) as HTMLInputElement
      ).disabled,
    ).toBe(true);
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Выбрать все · К выполнению" }),
    );
    expect(onSelect).toHaveBeenLastCalledWith(["grandchild"]);
    fireEvent.change(
      screen.getByRole("combobox", { name: "Отображение подзадач" }),
      { target: { value: "flat" } },
    );
    expect(
      screen.queryByRole("checkbox", { name: "Выбрать parent" }),
    ).toBeNull();
    expect(
      screen.getByRole("checkbox", { name: "Выбрать grandchild" }),
    ).toBeTruthy();
  });
});
