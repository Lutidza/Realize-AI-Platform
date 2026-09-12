/**
 * @file tests/int/ExecutionEvidence.int.spec.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Проверяет понятное ожидание исполнителя без повторного утверждения плана.
 */

import { cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  ChangeRequestDTO,
  ExecutionJobDTO,
  WorkerAvailabilityDTO,
} from "@realize/ai-contracts";
import { ExecutionEvidence } from "../../packages/payload-ai-plugin/src/admin/ExecutionEvidence";
import { ChangeRequestCard } from "../../packages/payload-ai-plugin/src/admin/ChangeRequestCard";

const time = "2026-09-11T12:00:00Z";
const job: ExecutionJobDTO = {
  id: "job-1",
  status: "queued",
  stage: "queued",
  allowedPaths: [],
  artifactsExpireAt: time,
  baseCommit: "abc",
  branch: "ai/change",
  changedPaths: [],
  checks: [],
  createdAt: time,
  updatedAt: time,
  diffStat: [],
  diffTruncated: false,
  workerSummary: "Задача ожидает отдельного execution worker.",
};
const worker: WorkerAvailabilityDTO = {
  state: "unavailable",
  reason: "Сигнал исполнителя устарел.",
  lastSeenAt: time,
  activeCount: 0,
  busyCount: 0,
  currentJob: null,
};
afterEach(cleanup);

describe("Ожидание исполнения в чате", () => {
  it("не дублирует старую причину под результатом и показывает причину ожидания публикации", () => {
    const change: ChangeRequestDTO = {
      id: "1",
      conversationID: "1",
      sourceMessageID: "1",
      title: "Страница",
      type: "CODE_CHANGE",
      riskLevel: "R3",
      state: "executing",
      version: 1,
      affectedPaths: [],
      checks: [],
      normalizedIntent: "Страница",
      originalRequest: "Страница",
      plan: "План",
      planHash: "plan",
      scopeHash: "scope",
      createdAt: time,
      updatedAt: time,
      expiresAt: time,
      execution: {
        enabled: false,
        job: { ...job, status: "running" },
        worker,
        reason: "Codex изменяет файлы.",
      },
      preview: { enabled: false },
      release: { enabled: false },
      sourcePromotion: {
        enabled: false,
        reason: "Публикация ожидает свободного исполнителя.",
        promotion: {
          id: "1",
          provider: "github",
          baseBranch: "main",
          headBranch: "ai/change",
          gitCommit: "abc",
          repositorySlug: "site/project",
          sourcePreviewArtifactHash: "sha",
          stage: "queued",
          status: "queued",
          createdAt: time,
          updatedAt: time,
        },
      },
    };
    render(
      createElement(ChangeRequestCard, {
        change,
        pending: false,
        onApprove: vi.fn(),
        onAcceptImplementation: vi.fn(),
        onAcceptPreview: vi.fn(),
        onApproveRelease: vi.fn(),
        onDeployPreview: vi.fn(),
        onExecute: vi.fn(),
        onPrepareRelease: vi.fn(),
        onPublishPullRequest: vi.fn(),
        onReject: vi.fn(),
        onRejectImplementation: vi.fn(),
        onRejectPreview: vi.fn(),
        onRejectRelease: vi.fn(),
      }),
    );
    expect(screen.queryByText("Codex изменяет файлы.")).toBeNull();
    expect(screen.getByText("Выполнение не подтверждено")).toBeTruthy();
    expect(
      screen.getByText("Публикация ожидает свободного исполнителя."),
    ).toBeTruthy();
  });

  it("сообщает о потере исполнителя уже начатого задания без имитации продолжающейся работы", () => {
    const { container } = render(
      createElement(ExecutionEvidence, {
        job: { ...job, status: "running", stage: "implementation" },
        worker: {
          ...worker,
          reason:
            "Связь с исполнителем потеряна. Автоматический повтор не выполняется.",
        },
        pending: false,
        onAccept: vi.fn(),
        onReject: vi.fn(),
      }),
    );
    expect(screen.getByText("Выполнение не подтверждено")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain(
      "Автоматический повтор не выполняется",
    );
    expect(container.querySelector(`time[datetime="${time}"]`)).toBeTruthy();
    expect(container.querySelector(".lucide-loader-circle")).toBeNull();
  });

  it("показывает живую причину и убирает впечатление активного выполнения при отсутствии исполнителя", () => {
    const { container } = render(
      createElement(ExecutionEvidence, {
        job,
        worker,
        reason: "Выполнение изменений выключено в настройках агента.",
        pending: false,
        onAccept: vi.fn(),
        onReject: vi.fn(),
      }),
    );
    expect(screen.getByText("Ожидаем исполнителя")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain(
      "Выполнение изменений выключено",
    );
    expect(screen.getByRole("status").textContent).toContain(
      "Повторное подтверждение не требуется",
    );
    expect(screen.queryByText(job.workerSummary!)).toBeNull();
    expect(container.querySelector(".lucide-loader-circle")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("показывает занятость и обновляет сообщение после появления свободного исполнителя", () => {
    const props = {
      job,
      worker: {
        ...worker,
        state: "busy" as const,
        reason: "Исполнитель занят другим заданием.",
      },
      pending: false,
      onAccept: vi.fn(),
      onReject: vi.fn(),
    };
    const { rerender } = render(createElement(ExecutionEvidence, props));
    expect(screen.getByText("В очереди")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain(
      "занят другим заданием",
    );
    rerender(
      createElement(ExecutionEvidence, {
        ...props,
        worker: {
          ...worker,
          state: "available",
          reason: "Исполнитель доступен и проверяет очередь.",
        },
      }),
    );
    expect(screen.getByRole("status").textContent).toContain(
      "доступен и проверяет очередь",
    );
  });
});
