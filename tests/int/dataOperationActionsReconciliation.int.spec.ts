/**
 * @file tests/int/dataOperationActionsReconciliation.int.spec.ts
 * @version 1.1.1
 * @date 2026-09-15
 * @description Проверяет согласование неизвестного DataOperation POST со свежим DTO после обновления чата.
 */

import { act, cleanup, renderHook } from "@testing-library/react";
import type {
  ConversationDetailDTO,
  DataOperationDTO,
} from "@realize/ai-contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDataOperations } from "../../packages/payload-ai-plugin/src/admin/useDataOperations";

const request = vi.hoisted(() => vi.fn());
vi.mock("../../packages/payload-ai-plugin/src/admin/realizeAIAPI", () => ({
  requestRealizeAI: request,
}));
beforeEach(() => request.mockReset());
afterEach(cleanup);

const operation = {
  id: "41",
  conversationID: "7",
  operationHash: "a".repeat(64),
  version: 1,
  state: "awaiting_approval",
} as DataOperationDTO;
const detailFor = (dataOperations: DataOperationDTO[]) =>
  ({
    conversation: { id: "7" },
    dataOperations,
  }) as ConversationDetailDTO;
const optionsFor = () => ({
  detailRef: {
    current: detailFor([operation]) as ConversationDetailDTO | undefined,
  },
  setDetail: vi.fn(),
  setError: vi.fn(),
  setPending: vi.fn(),
});

describe("DataOperation reconciliation после обновления чата", () => {
  it("потерянный ответ создания страницы повторяет тот же apply без второго намерения", async () => {
    const approved = {
      ...operation,
      kind: "pages.createDraft.v1",
      rollbackStrategy: "delete-created-draft",
      preview: {
        title: "О компании",
        slug: "about",
        sections: [{ body: "Демо" }],
        status: "draft",
      },
      state: "approved",
      version: 2,
    } as DataOperationDTO;
    const options = optionsFor();
    options.detailRef.current = detailFor([approved]);
    options.setDetail.mockImplementation((updater) => {
      options.detailRef.current = updater(options.detailRef.current);
    });
    const applied = {
      ...approved,
      state: "applied",
      version: 3,
      result: {
        page: { id: "99", title: "О компании", slug: "about" },
        adminUrl: "/admin/collections/pages/99",
      },
    };
    request
      .mockRejectedValueOnce(new Error("POST response lost"))
      .mockResolvedValueOnce(approved)
      .mockResolvedValueOnce(applied);
    const { result } = renderHook(() => useDataOperations(options));
    await act(() => result.current.applyDataOperation(approved));
    expect(result.current.hasRetry).toBe(true);
    await act(() => result.current.createDataOperation("12"));
    expect(request).toHaveBeenCalledTimes(2);
    await act(() => result.current.retry());
    expect(request.mock.calls[2][0]).toBe("/data-operations/41/apply");
    expect(request.mock.calls[2][1].body).toBe(request.mock.calls[0][1].body);
    expect(request.mock.calls[2][1].headers).toEqual(
      request.mock.calls[0][1].headers,
    );
    expect(result.current.hasRetry).toBe(false);
    expect(options.detailRef.current?.dataOperations[0]).toEqual(applied);
  });

  it("после потерянных approve POST/GET свежий approved DTO разрешает apply с новой версией и ключом", async () => {
    const options = optionsFor();
    const approved: DataOperationDTO = {
      ...operation,
      state: "approved",
      version: 2,
    };
    request
      .mockRejectedValueOnce(new Error("POST response lost"))
      .mockRejectedValueOnce(new Error("GET response lost"))
      .mockResolvedValueOnce({ ...approved, state: "applied", version: 3 });
    const { result, rerender } = renderHook(() => useDataOperations(options));
    await act(() => result.current.decideDataOperation(operation, "approve"));
    expect(result.current.isLocked).toBe(true);
    options.detailRef.current = detailFor([approved]);
    rerender();
    expect(result.current).toMatchObject({ isLocked: false, hasRetry: false });
    await act(() => result.current.applyDataOperation(approved));
    expect(request).toHaveBeenCalledTimes(3);
    expect(request.mock.calls[2][0]).toBe("/data-operations/41/apply");
    expect(JSON.parse(request.mock.calls[2][1].body)).toMatchObject({
      expectedVersion: 2,
    });
    expect(request.mock.calls[2][1].headers).not.toEqual(
      request.mock.calls[0][1].headers,
    );
  });

  it.each(["same version", "different operation", "missing operation"])(
    "%s не снимает неопределённость и сохраняет точный повтор",
    async (scenario) => {
      const options = optionsFor();
      request
        .mockRejectedValueOnce(new Error("POST response lost"))
        .mockRejectedValueOnce(new Error("GET response lost"))
        .mockResolvedValueOnce({ ...operation, state: "approved", version: 2 });
      const { result, rerender } = renderHook(() => useDataOperations(options));
      await act(() =>
        result.current.decideDataOperation(
          operation,
          "approve",
          "Исходное решение",
        ),
      );
      options.detailRef.current = detailFor(
        scenario === "missing operation"
          ? []
          : [
              scenario === "different operation"
                ? { ...operation, id: "42", version: 9 }
                : { ...operation },
            ],
      );
      rerender();
      expect(result.current.isLocked).toBe(true);
      await act(() => result.current.applyDataOperation(operation));
      expect(request).toHaveBeenCalledTimes(2);
      await act(() => result.current.retry());
      expect(request.mock.calls[2][0]).toBe(request.mock.calls[0][0]);
      expect(request.mock.calls[2][1].body).toBe(request.mock.calls[0][1].body);
      expect(request.mock.calls[2][1].headers).toEqual(
        request.mock.calls[0][1].headers,
      );
    },
  );
});
