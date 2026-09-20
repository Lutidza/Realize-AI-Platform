/**
 * @file tests/int/task-workbench-toolbar.int.spec.ts
 * @version 1.1.0
 * @date 2026-09-18
 * @description Проверяет границы доступа поисковой выдачи и уведомлений общего topbar.
 * @see documentation/architecture/system-admin-shell.md
 */
import { describe, expect, it } from "vitest";
import { initialPrototypeState } from "../../src/components/admin/task-manager/reference/taskManager.fixtures";
import { getLocationPath } from "../../src/components/admin/task-manager/reference/taskManager.hierarchy";
import {
  getToolbarNotifications,
  getToolbarSearchRecords,
} from "../../src/components/admin/task-manager/reference/taskWorkbenchToolbar.selectors";

describe("Данные верхней панели reference", () => {
  it("сохраняет путь вложенного списка и идентификатор задачи для поиска", () => {
    const state = structuredClone(initialPrototypeState);
    const records = getToolbarSearchRecords(state);
    expect(
      records.find((record) => record.id === "list:l-references")?.description,
    ).toContain("Интерфейс / Референсы");
    expect(
      records.find((record) => record.id === "task:TM-101")?.keywords,
    ).toContain("TM-101");
  });
  it("исключает закрытую среду и все её дочерние объекты из обоих источников", () => {
    const state = structuredClone(initialPrototypeState);
    const workspace = state.workspaces.find((item) => item.id === "w-realize")!;
    workspace.ownerId = "anna";
    workspace.members = [];
    workspace.visibility = "private";
    const records = getToolbarSearchRecords(state);
    expect(
      records.some(
        (record) =>
          getLocationPath(state, record.location)[0]?.id === workspace.id,
      ),
    ).toBe(false);
    expect(getToolbarNotifications(state, workspace.id)).toEqual([]);
  });
  it("не показывает архивные задачи, архивные среды и повреждённые связи", () => {
    const state = structuredClone(initialPrototypeState);
    const task = state.tasks[0];
    task.archived = true;
    expect(
      getToolbarSearchRecords(state).some(
        (record) => record.taskId === task.id,
      ),
    ).toBe(false);
    task.archived = false;
    task.projectId = "p-store";
    task.status = "review";
    expect(
      getToolbarSearchRecords(state).some(
        (record) => record.taskId === task.id,
      ),
    ).toBe(false);
    expect(
      getToolbarNotifications(state, "w-realize").some(
        (record) => record.taskId === task.id,
      ),
    ).toBe(false);
    state.workspaces.forEach((workspace) => {
      workspace.archived = true;
    });
    expect(getToolbarSearchRecords(state)).toEqual([]);
  });
  it("уведомляет только о требующем внимания состоянии в выбранной среде", () => {
    const state = structuredClone(initialPrototypeState);
    state.tasks = [state.tasks[0]];
    const task = state.tasks[0];
    task.status = "ready";
    task.run.state = "idle";
    delete task.handoff;
    expect(getToolbarNotifications(state, "w-realize")).toEqual([]);
    task.run.state = "failed";
    const first = getToolbarNotifications(state, "w-realize");
    expect(first).toHaveLength(1);
    expect(first[0].description).toContain("ошибкой");
    const translated = getToolbarNotifications(state, "w-realize", "en");
    expect(translated[0].id).toBe(first[0].id);
    expect(translated[0].description).toContain("Execution failed");
    expect(getToolbarNotifications(state, "w-personal")).toEqual([]);
    task.run.attempt += 1;
    expect(getToolbarNotifications(state, "w-realize")[0].id).not.toBe(
      first[0].id,
    );
  });
});
