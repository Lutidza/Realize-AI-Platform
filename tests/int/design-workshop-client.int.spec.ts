/**
 * @file tests/int/design-workshop-client.int.spec.ts
 * @version 1.0.0
 * @date 2026-09-25
 * @description Проверяет повтор потерянного ответа, конфликты и сохранение исторического снимка новой версией.
 * @see documentation/specifications/design-workshop.md
 */
import {
  act,
  cleanup,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  DesignChangeDto,
  DesignMutationReceiptDto,
  DesignProjectDto,
  DesignRevisionDto,
} from "@realize/ai-contracts";
import { DesignWorkshopApi } from "../../packages/payload-ai-plugin/src/admin/design-workshop/DesignWorkshopApi.client";
import { useWorkshopProject } from "../../packages/payload-ai-plugin/src/admin/design-workshop/useWorkshopProject.hook";
import { workshopDraftCommand } from "../../packages/payload-ai-plugin/src/admin/design-workshop/workshopDraft.util";
import { getSystemAdminNavigation } from "../../src/components/admin/system-shell/systemAdmin.navigation";
import { normalizeSystemAdminNavigationPreferences } from "../../packages/ui-kit/src/system-admin-shell/systemAdminNavigationPreferences.util";
import { designProjectFixture } from "./designWorkshop.fixture";
import { WorkshopHistory } from "../../packages/payload-ai-plugin/src/admin/design-workshop/WorkshopHistory.component";

const projectId = "7d7b1001-c9d6-4ee0-9363-c5466c289001";
const firstId = "7d7b1001-c9d6-4ee0-9363-c5466c289002";
const secondId = "7d7b1001-c9d6-4ee0-9363-c5466c289003";
const changeId = "7d7b1001-c9d6-4ee0-9363-c5466c289004";
const base: DesignRevisionDto = {
  projectId,
  revisionId: firstId,
  number: 1,
  contentHash: "a".repeat(64),
  parentRevisionId: null,
  author: { actorId: "1", channel: "admin" },
  snapshot: designProjectFixture().snapshot,
  createdAt: "2026-09-25T00:00:00.000Z",
};
const project: DesignProjectDto = {
  projectId,
  title: "Task Manager",
  target: "admin",
  kind: "reference",
  workspace: { mode: "stored_draft", bindingId: changeId },
  currentRevision: {
    revisionId: base.revisionId,
    number: 1,
    contentHash: base.contentHash,
  },
  createdAt: base.createdAt,
  updatedAt: base.createdAt,
};
const receipt = (
  action: DesignMutationReceiptDto["action"],
): DesignMutationReceiptDto => ({
  operationId: projectId,
  action,
  projectId,
  changeId: action === "create" ? null : changeId,
  revision:
    action === "apply"
      ? { revisionId: secondId, number: 2, contentHash: "b".repeat(64) }
      : project.currentRevision,
});
const ok = (data: unknown) =>
  Response.json({ ok: true, data, correlationID: "test" });
const fail = (status: number) =>
  Response.json(
    {
      ok: false,
      error: { code: "CONFLICT", message: "Версия изменилась." },
      correlationID: "test",
    },
    { status },
  );
const candidate = (snapshot = base.snapshot): DesignChangeDto => ({
  changeId,
  projectId,
  baseRevision: project.currentRevision,
  candidateHash: "b".repeat(64),
  candidate: snapshot,
  diff: { briefChanged: true, sourcesChanged: false, files: [] },
  summary: "Уточнение",
  status: "prepared",
  appliedRevisionId: null,
  createdAt: base.createdAt,
  expiresAt: "2026-09-26T00:00:00.000Z",
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Workshop client delivery", () => {
  it("успешное чтение версии не скрывает ошибку параллельной загрузки истории", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(fail(503))
      .mockResolvedValueOnce(ok(base));
    render(
      createElement(WorkshopHistory, {
        api: new DesignWorkshopApi(fetcher),
        projectId,
        current: project.currentRevision,
        onRestore: () => undefined,
        disabled: false,
      }),
    );
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Версия 1" })).toBeTruthy(),
    );
    expect(screen.getByRole("alert").textContent).toContain(
      "Версия изменилась.",
    );
    expect(screen.getByRole("button", { name: "Повторить" })).toBeTruthy();
  });
  it("повторяет мутацию с тем же ключом после потери ответа", async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("network"))
      .mockResolvedValueOnce(ok(receipt("create")));
    const api = new DesignWorkshopApi(fetcher);
    await expect(api.mutate("", designProjectFixture())).rejects.toThrow(
      "Не удалось связаться",
    );
    await api.mutate("", designProjectFixture());
    const first = fetcher.mock.calls[0][1];
    const second = fetcher.mock.calls[1][1];
    expect(first.headers["Idempotency-Key"]).toBe(
      second.headers["Idempotency-Key"],
    );
    expect(second.body).toBe(first.body);
    expect(second.credentials).toBe("same-origin");
  });
  it("не переиспользует ключ для изменённого запроса", async () => {
    const fetcher = vi.fn().mockResolvedValue(ok(receipt("create")));
    const api = new DesignWorkshopApi(async (...args) => {
      const response = await fetcher(...args);
      return response.clone();
    });
    await api.mutate("", { title: "Первый" });
    await api.mutate("", { title: "Второй" });
    expect(fetcher.mock.calls[0][1].headers["Idempotency-Key"]).not.toBe(
      fetcher.mock.calls[1][1].headers["Idempotency-Key"],
    );
  });
  it("сохраняет draft при конфликте и меняет базу только по явному действию", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(ok(project))
      .mockResolvedValueOnce(ok(base));
    vi.stubGlobal("fetch", fetcher);
    const { result } = renderHook(() => useWorkshopProject(projectId));
    await waitFor(() => expect(result.current.state).not.toBeNull());
    const draft = structuredClone(base.snapshot);
    draft.brief.goal = "Мой изменённый бриф";
    act(() => {
      result.current.setDraft(draft);
      result.current.setSummary("Уточнение");
    });
    fetcher.mockResolvedValueOnce(fail(409));
    await act(() => result.current.prepare());
    expect(result.current.conflict).toBe(true);
    expect(result.current.state?.draft).toEqual(draft);
    expect(result.current.state?.revision.revisionId).toBe(firstId);
    const latest = { ...base, number: 2, revisionId: secondId };
    fetcher
      .mockResolvedValueOnce(ok({ ...project, currentRevision: latest }))
      .mockResolvedValueOnce(ok(latest));
    await act(() => result.current.refresh(true));
    expect(result.current.state?.revision.revisionId).toBe(secondId);
    expect(result.current.state?.draft).toEqual(draft);
    fetcher
      .mockResolvedValueOnce(ok(receipt("prepare")))
      .mockResolvedValueOnce(ok(candidate(draft)));
    await act(() => result.current.prepare());
    const sent = JSON.parse(fetcher.mock.calls[5][1].body);
    expect(sent.baseRevisionId).toBe(secondId);
    expect(sent.brief.goal).toBe(draft.brief.goal);
  });
  it("после потерянного чтения применённой версии повторяет тот же apply, не теряя candidate", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(ok(project))
      .mockResolvedValueOnce(ok(base));
    vi.stubGlobal("fetch", fetcher);
    const { result } = renderHook(() => useWorkshopProject(projectId));
    await waitFor(() => expect(result.current.state).not.toBeNull());
    const draft = structuredClone(base.snapshot);
    draft.brief.goal = "Обновлённая задача";
    act(() => {
      result.current.setDraft(draft);
      result.current.setSummary("Уточнение");
    });
    fetcher
      .mockResolvedValueOnce(ok(receipt("prepare")))
      .mockResolvedValueOnce(ok(candidate(draft)));
    await act(() => result.current.prepare());
    fetcher
      .mockResolvedValueOnce(ok(receipt("apply")))
      .mockRejectedValueOnce(new TypeError("network"));
    await act(() => result.current.apply());
    expect(result.current.state?.candidate?.changeId).toBe(changeId);
    expect(result.current.dirty).toBe(true);
    fetcher
      .mockResolvedValueOnce(ok(receipt("apply")))
      .mockResolvedValueOnce(
        ok({ ...base, revisionId: secondId, number: 2, snapshot: draft }),
      );
    await act(() => result.current.apply());
    expect(fetcher.mock.calls[4][1].headers["Idempotency-Key"]).toBe(
      fetcher.mock.calls[6][1].headers["Idempotency-Key"],
    );
    expect(result.current.state?.revision.number).toBe(2);
    expect(result.current.dirty).toBe(false);
    expect(result.current.state?.candidate).toBeNull();
  });
  it("исторический снимок сохраняется относительно актуальной базы с явным удалением новых файлов", () => {
    const current = structuredClone(base.snapshot);
    current.files.push({
      path: "src/New.tsx",
      content: "export const New = () => null;",
    });
    current.files[0].content = "Новое содержимое";
    const command = workshopDraftCommand(
      secondId,
      current,
      base.snapshot,
      "Вернуться к первой версии",
    );
    expect(command.baseRevisionId).toBe(secondId);
    expect(command.operations).toEqual(
      expect.arrayContaining([
        { kind: "delete", path: "src/New.tsx" },
        { kind: "put", ...base.snapshot.files[0] },
      ]),
    );
    expect(current.files).toHaveLength(3);
  });
  it("новая навигация открывает Мастерскую и сохраняет явное скрытие пользователя", () => {
    const navigation = getSystemAdminNavigation({ onTasks: () => undefined });
    const workshop = navigation.find((item) => item.id === "workshop");
    expect(workshop?.href).toBe("/system/workshop");
    expect(
      normalizeSystemAdminNavigationPreferences(navigation).hidden,
    ).not.toContain("workshop");
    expect(
      normalizeSystemAdminNavigationPreferences(navigation, {
        order: navigation.map((item) => item.id),
        hidden: ["workshop"],
      }).hidden,
    ).toContain("workshop");
  });
});
