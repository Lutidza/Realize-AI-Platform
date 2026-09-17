/**
 * @file tests/int/chatExecutionReactivity.int.spec.ts
 * @version 1.0.0
 * @date 2026-09-15
 * @description Проверяет настоящие mutation и polling hooks в StrictMode без потери новых событий диалога.
 * @see documentation/delivery/01-local-admin-ai.md
 */
import { act, cleanup, renderHook } from "@testing-library/react";
import type {
  ChangeRequestDTO,
  ConversationDetailDTO,
  ExecutionJobDTO,
} from "@realize/ai-contracts";
import { StrictMode, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useChangeRequests } from "../../packages/payload-ai-plugin/src/admin/useChangeRequests";
import { useExecutionPolling } from "../../packages/payload-ai-plugin/src/admin/useExecutionPolling";
import { useConversationDetailState } from "../../packages/payload-ai-plugin/src/admin/useConversationDetailState.hook";

const mocks = vi.hoisted(() => ({ request: vi.fn(), setPending: vi.fn() }));
vi.mock("../../packages/payload-ai-plugin/src/admin/realizeAIAPI", () => ({
  requestRealizeAI: mocks.request,
}));
const time = "2026-09-15T12:00:00Z";
const change = (
  status?: ExecutionJobDTO["status"],
  version = 1,
): ChangeRequestDTO => ({
  id: "change-1",
  conversationID: "chat-1",
  sourceMessageID: "message-1",
  title: "Изменение интерфейса",
  type: "CODE_CHANGE",
  riskLevel: "R3",
  state:
    status === "blocked"
      ? "blocked"
      : status === "failed"
        ? "validation_failed"
        : status === "completed"
          ? "changes_ready"
          : status === "running"
            ? "executing"
            : status
              ? "execution_queued"
              : "plan_approved",
  version,
  affectedPaths: ["src/components/example.tsx"],
  checks: [],
  normalizedIntent: "Изменение",
  originalRequest: "Изменение",
  plan: "План изменения",
  planHash: "a".repeat(64),
  scopeHash: "b".repeat(64),
  createdAt: time,
  updatedAt: time,
  expiresAt: time,
  execution: {
    enabled: true,
    ...(status
      ? {
          job: {
            id: "job-1",
            status,
            stage:
              status === "running"
                ? "implementation"
                : status === "queued"
                  ? "queued"
                  : "complete",
            allowedPaths: [],
            artifactsExpireAt: time,
            baseCommit: "c".repeat(40),
            branch: "ai/change-test",
            changedPaths: [],
            checks: [],
            createdAt: time,
            updatedAt: time,
            diffStat: [],
            diffTruncated: false,
            ...(status === "blocked"
              ? { errorSummary: "Worker completed without a code diff." }
              : {}),
          },
        }
      : {}),
  },
  preview: { enabled: false },
  release: { enabled: false },
  sourcePromotion: { enabled: false },
});
const conversation = (
  status?: ExecutionJobDTO["status"],
  version = 1,
): ConversationDetailDTO => ({
  conversation: {
    id: "chat-1",
    title: "Диалог",
    status: "active",
    createdAt: time,
    updatedAt: time,
    lastMessageAt: time,
  },
  messages: [],
  runs: [],
  dataOperations: [],
  changeRequests: [change(status, version)],
});

const setup = () =>
  renderHook(
    () => {
      const { detail, detailRef, setDetail } =
        useConversationDetailState(conversation());
      const [error, setError] = useState<string>();
      const actions = useChangeRequests({
        detailRef,
        setDetail,
        setError,
        // Отдельный pending render не должен маскировать eager updater ветку React.
        setIsPlanActionPending: mocks.setPending,
      });
      useExecutionPolling({ detail, detailRef, setDetail, setError });
      return { detail, detailRef, setDetail, actions, error };
    },
    { wrapper: StrictMode },
  );

/** Ответ POST приходит после завершения синхронного обработчика действия. */
const execute = async (hook: ReturnType<typeof setup>) => {
  let resolve!: (result: ChangeRequestDTO) => void;
  mocks.request.mockReturnValueOnce(
    new Promise<ChangeRequestDTO>((done) => {
      resolve = done;
    }),
  );
  let pending!: Promise<void>;
  act(() => {
    pending = hook.result.current.actions.executeChangeRequest(change());
  });
  await act(async () => {
    resolve(change("queued", 2));
    await pending;
  });
};

beforeEach(() => {
  vi.useFakeTimers();
  mocks.request.mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Реактивность выполнения после настоящего mutation hook", () => {
  it.each(["blocked", "failed", "completed"] as const)(
    "после execute показывает queued → running → %s без перезагрузки",
    async (terminal) => {
      const hook = setup();
      await execute(hook);
      expect(
        hook.result.current.detail?.changeRequests[0].execution.job?.status,
      ).toBe("queued");
      expect(hook.result.current.detailRef.current).toBe(
        hook.result.current.detail,
      );
      mocks.request
        .mockResolvedValueOnce(conversation("running", 3))
        .mockResolvedValue(conversation(terminal, 4));
      await act(() => vi.advanceTimersByTimeAsync(1_500));
      expect(
        hook.result.current.detail?.changeRequests[0].execution.job?.status,
      ).toBe("running");
      await act(() => vi.advanceTimersByTimeAsync(1_500));
      expect(
        hook.result.current.detail?.changeRequests[0].execution.job?.status,
      ).toBe(terminal);
      expect(hook.result.current.detailRef.current).toBe(
        hook.result.current.detail,
      );
      const requestCount = mocks.request.mock.calls.length;
      await act(() => vi.advanceTimersByTimeAsync(6_000));
      expect(mocks.request).toHaveBeenCalledTimes(requestCount);
    },
  );

  it("поздний poll не теряет новое сообщение и следующий poll продолжает обновления", async () => {
    const hook = setup();
    await execute(hook);
    let resolve!: (result: ConversationDetailDTO) => void;
    mocks.request.mockReturnValueOnce(
      new Promise<ConversationDetailDTO>((done) => {
        resolve = done;
      }),
    );
    await act(() => vi.advanceTimersByTimeAsync(1_500));
    const message: ConversationDetailDTO["messages"][number] = {
      id: "new-message",
      content: "Новое сохранённое сообщение",
      conversationID: "chat-1",
      createdAt: time,
      dataOperationIntentAvailable: false,
      kind: "assistant_message",
      role: "assistant",
      sequence: 3,
      changePlan: { status: "needs_clarification", reason: "too_short" },
    };
    act(() =>
      hook.result.current.setDetail((current) =>
        current
          ? { ...current, messages: [...current.messages, message] }
          : current,
      ),
    );
    await act(async () => resolve(conversation("blocked", 3)));
    expect(hook.result.current.detail?.messages).toEqual([message]);
    expect(
      hook.result.current.detail?.changeRequests[0].execution.job?.status,
    ).toBe("queued");
    expect(hook.result.current.detailRef.current).toBe(
      hook.result.current.detail,
    );
    mocks.request.mockResolvedValue({
      ...conversation("blocked", 3),
      messages: [message],
    });
    await act(() => vi.advanceTimersByTimeAsync(1_500));
    expect(
      hook.result.current.detail?.changeRequests[0].execution.job?.status,
    ).toBe("blocked");
    expect(hook.result.current.detail?.messages).toEqual([message]);
  });

  it("не перезаписывает новое действие пользователя поздним снимком диалога", async () => {
    const hook = setup();
    await execute(hook);
    let resolvePoll!: (result: ConversationDetailDTO) => void;
    mocks.request.mockReturnValueOnce(
      new Promise<ConversationDetailDTO>((done) => {
        resolvePoll = done;
      }),
    );
    await act(() => vi.advanceTimersByTimeAsync(1_500));
    const additional: ChangeRequestDTO = {
      ...change(),
      id: "change-2",
      sourceMessageID: "message-2",
      state: "awaiting_plan_approval",
    };
    mocks.request.mockResolvedValueOnce(additional);
    await act(async () =>
      hook.result.current.actions.createChangeRequest("message-2"),
    );
    await act(async () => resolvePoll(conversation("blocked", 3)));
    expect(
      hook.result.current.detail?.changeRequests.map((item) => item.id),
    ).toEqual(["change-1", "change-2"]);
    expect(
      hook.result.current.detail?.changeRequests[0].execution.job?.status,
    ).toBe("queued");
    expect(hook.result.current.detailRef.current).toBe(
      hook.result.current.detail,
    );
  });
});
