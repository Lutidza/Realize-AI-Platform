/**
 * @file tests/int/pagePublicationActions.int.spec.ts
 * @version 1.1.1
 * @date 2026-09-15
 * @description Проверяет CAS/review payload, точные повторы создания с новым ID и отдельную доставку публикации.
 */
import type { ConversationDetailDTO } from "@realize/ai-contracts";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDataOperations } from "../../packages/payload-ai-plugin/src/admin/useDataOperations";
import { draft, publication } from "./pagePublication.fixture";
import { RealizeAIRequestError } from "../../packages/payload-ai-plugin/src/admin/RealizeAIRequest.error";
const request = vi.hoisted(() => vi.fn());
vi.mock("../../packages/payload-ai-plugin/src/admin/realizeAIAPI", () => ({
  requestRealizeAI: request,
}));
beforeEach(() => request.mockReset());
afterEach(cleanup);
const optionsFor = () => {
  const options = {
    detailRef: {
      current: { conversation: { id: "7" }, dataOperations: [draft] } as
        ConversationDetailDTO | undefined,
    },
    setDetail: vi.fn(),
    setError: vi.fn(),
    setPending: vi.fn(),
  };
  options.setDetail.mockImplementation((updater) => {
    options.detailRef.current = updater(options.detailRef.current);
  });
  return options;
};
describe("HTTP действия публикации через Data Lane", () => {
  it.each(["approve", "apply"] as const)(
    "409 в %s закрывает прежний CAS, перечитывание его не снимает marker, новая версия снимает",
    async (action) => {
      const options = optionsFor();
      options.detailRef.current!.dataOperations = [publication];
      request
        .mockRejectedValueOnce(
          new RealizeAIRequestError("stale", { status: 409, code: "CONFLICT" }),
        )
        .mockResolvedValueOnce(publication);
      const { result, rerender } = renderHook(() => useDataOperations(options));
      await act(() =>
        action === "approve"
          ? result.current.decideDataOperation(publication, "approve")
          : result.current.applyDataOperation(publication),
      );
      expect(result.current.staleMarkers[publication.id]).toMatchObject({
        operationID: publication.id,
        expectedVersion: publication.version,
        expectedOperationHash: publication.operationHash,
      });
      expect(result.current.hasRetry).toBe(false);
      rerender();
      expect(result.current.staleMarkers[publication.id]).toBeTruthy();
      options.detailRef.current!.dataOperations = [
        { ...publication, version: publication.version + 1 },
      ];
      await act(async () => rerender());
      expect(result.current.staleMarkers[publication.id]).toBeUndefined();
    },
  );
  it("повторяет создание тем же key/body и не считает обновлённый source подтверждением нового ID", async () => {
    const options = optionsFor();
    request
      .mockRejectedValueOnce(new Error("lost POST response"))
      .mockResolvedValueOnce(publication);
    const { result, rerender } = renderHook(() => useDataOperations(options));
    await act(() => result.current.preparePagePublication(draft));
    expect(request).toHaveBeenCalledTimes(1);
    expect(JSON.parse(request.mock.calls[0]![1].body)).toEqual({
      expectedVersion: draft.version,
      expectedOperationHash: draft.operationHash,
    });
    expect(result.current.hasRetry).toBe(true);
    options.detailRef.current!.dataOperations = [
      { ...draft, version: draft.version + 1 },
    ];
    rerender();
    expect(result.current.hasRetry).toBe(true);
    await act(() => result.current.retry());
    expect(request.mock.calls[1]![0]).toBe(
      "/data-operations/41/page-publication",
    );
    expect(request.mock.calls[1]![1].body).toBe(request.mock.calls[0]![1].body);
    expect(request.mock.calls[1]![1].headers).toEqual(
      request.mock.calls[0]![1].headers,
    );
    expect(result.current.hasRetry).toBe(false);
    expect(
      options.detailRef.current!.dataOperations.map((item) => item.id),
    ).toEqual(["41", "51"]);
    expect(
      options.detailRef.current!.dataOperations.every(
        (item) => item.sourceMessageID === "12",
      ),
    ).toBe(true);
  });
  it("передаёт человеческий review только в approve вместе с CAS", async () => {
    const options = optionsFor();
    request.mockResolvedValue({
      ...publication,
      state: "approved",
      version: 2,
    });
    const { result } = renderHook(() => useDataOperations(options));
    const review = {
      manifestHash: publication.preview.manifestHash,
      desktop: true,
      mobile: true,
      noErrors: true,
    } as const;
    await act(() =>
      result.current.decideDataOperation(
        publication,
        "approve",
        undefined,
        review,
      ),
    );
    expect(JSON.parse(request.mock.calls[0]![1].body)).toEqual({
      expectedVersion: publication.version,
      expectedOperationHash: publication.operationHash,
      previewReview: review,
    });
  });
  it("восстановление создаёт новую операцию, а доставка вызывает собственный endpoint", async () => {
    const options = optionsFor();
    const restore = {
      ...publication,
      id: "52",
      kind: "pages.restorePublication.v1",
      rollbackStrategy: "none",
    };
    request
      .mockResolvedValueOnce(restore)
      .mockResolvedValueOnce({ ...publication, state: "applied" });
    const { result } = renderHook(() => useDataOperations(options));
    await act(() => result.current.preparePublicationRestore(publication));
    await act(() => result.current.retryPublicationDelivery(publication));
    expect(request.mock.calls.map((call) => call[0])).toEqual([
      "/data-operations/51/page-publication-restore",
      "/data-operations/51/page-publication-delivery",
    ]);
    expect(
      request.mock.calls.some(
        (call) => call[0].endsWith("/apply") || call[0].endsWith("/rollback"),
      ),
    ).toBe(false);
  });
});
