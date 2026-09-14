/**
 * @file tests/int/pagePublicationUI.int.spec.ts
 * @version 1.2.0
 * @date 2026-09-14
 * @description Проверяет явный review выбранного manifest, снятие stale подтверждений и раздельные действия доставки/восстановления.
 */
import type {
  DataOperationDTO,
  PagePublicationRestoreOperationDTO,
} from "@realize/ai-contracts";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DataOperationCard } from "../../packages/payload-ai-plugin/src/admin/DataOperationCard";
import { draft, publication } from "./pagePublication.fixture";
const propsFor = (operation: DataOperationDTO = publication) => ({
  operation,
  pending: false,
  onApply: vi.fn(),
  onApprove: vi.fn(),
  onReject: vi.fn(),
  onApproveRollback: vi.fn(),
  onRollback: vi.fn(),
  onPreparePublicationRestore: vi.fn(),
  onRetryPublicationDelivery: vi.fn(),
});
const confirmChecks = () =>
  screen
    .getAllByRole("checkbox")
    .forEach((checkbox) => fireEvent.click(checkbox));
const approve = () =>
  screen.getByRole("button", {
    name: /^(Подтвердить публикацию|Сохраняем…)$/,
  }) as HTMLButtonElement;
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Публикация именно просмотренной версии", () => {
  it("локальный stale marker закрывает review/approve/apply только прежнего CAS", () => {
    const props = propsFor();
    const marker = {
      operationID: publication.id,
      expectedVersion: publication.version,
      expectedOperationHash: publication.operationHash,
      message: "Сохранённая версия изменилась. Подготовьте новую операцию.",
    };
    const { rerender } = render(
      createElement(DataOperationCard, { ...props, staleMarker: marker }),
    );
    expect(approve().disabled).toBe(true);
    expect(
      screen
        .getAllByRole("checkbox")
        .every((el) => (el as HTMLInputElement).disabled),
    ).toBe(true);
    expect(screen.getByText(marker.message)).toBeTruthy();
    rerender(
      createElement(DataOperationCard, {
        ...props,
        staleMarker: marker,
        operation: { ...publication, state: "approved" },
      }),
    );
    expect(
      (
        screen.getByRole("button", {
          name: "Опубликовать страницу",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    rerender(
      createElement(DataOperationCard, {
        ...props,
        staleMarker: marker,
        operation: { ...publication, version: publication.version + 1 },
      }),
    );
    expect(screen.queryByText(marker.message)).toBeNull();
    confirmChecks();
    expect(approve().disabled).toBe(false);
  });
  it("требует все три явных свидетельства и передаёт точный manifest без автоматического apply", () => {
    const props = propsFor();
    render(createElement(DataOperationCard, props));
    expect(approve().disabled).toBe(true);
    const checks = screen.getAllByRole("checkbox");
    fireEvent.click(checks[0]!);
    fireEvent.click(checks[1]!);
    expect(approve().disabled).toBe(true);
    fireEvent.click(checks[2]!);
    fireEvent.click(approve());
    expect(props.onApprove).toHaveBeenCalledWith({
      manifestHash: publication.preview.manifestHash,
      desktop: true,
      mobile: true,
      noErrors: true,
    });
    expect(props.onApply).not.toHaveBeenCalled();
    expect(screen.getByText("Страница не опубликована")).toBeTruthy();
    expect(screen.getByText("Будет опубликована: Доставка")).toBeTruthy();
  });
  it.each(["version", "manifest", "pending"])(
    "снимает свидетельство при смене %s и не воскрешает его при возврате props",
    (change) => {
      const props = propsFor();
      const { rerender } = render(createElement(DataOperationCard, props));
      confirmChecks();
      expect(approve().disabled).toBe(false);
      rerender(
        createElement(
          DataOperationCard,
          change === "pending"
            ? { ...props, pending: true }
            : {
                ...props,
                operation:
                  change === "version"
                    ? { ...publication, version: 2 }
                    : {
                        ...publication,
                        preview: {
                          ...publication.preview,
                          manifestHash: "f".repeat(64),
                        },
                      },
              },
        ),
      );
      expect(approve().disabled).toBe(true);
      rerender(createElement(DataOperationCard, props));
      expect(approve().disabled).toBe(true);
      expect(
        screen
          .getAllByRole("checkbox")
          .every((el) => !(el as HTMLInputElement).checked),
      ).toBe(true);
    },
  );
  it("закрывает подтверждение по TTL без изменения props", async () => {
    vi.useFakeTimers();
    const props = propsFor({
      ...publication,
      expiresAt: new Date(Date.now() + 1000).toISOString(),
    });
    render(createElement(DataOperationCard, props));
    confirmChecks();
    await act(async () => vi.advanceTimersByTime(1001));
    expect(
      screen.queryByRole("button", { name: "Подтвердить публикацию" }),
    ).toBeNull();
    expect(screen.getByText("Срок подтверждения истёк")).toBeTruthy();
  });
  it("не разрешает утверждать проваленные обязательные проверки", () => {
    render(
      createElement(
        DataOperationCard,
        propsFor({
          ...publication,
          preview: {
            ...publication.preview,
            checks: [
              {
                id: "dependency",
                status: "failed",
                severity: "error",
                message: "Зависимость изменилась.",
              },
            ],
          },
        }),
      ),
    );
    confirmChecks();
    expect(approve().disabled).toBe(true);
  });
  it.each(["pending", "failed"] as const)(
    "показывает delivery %s отдельно и повторяет только доставку",
    (status) => {
      const props = propsFor({
        ...publication,
        state: "applied",
        result: {
          page: draft.result!.page,
          adminUrl: draft.result!.adminUrl,
          publicUrl: "/delivery",
          delivery: { status },
        },
      });
      render(createElement(DataOperationCard, props));
      fireEvent.click(
        screen.getByRole("button", { name: "Повторить обновление витрины" }),
      );
      expect(props.onRetryPublicationDelivery).toHaveBeenCalledOnce();
      expect(props.onApply).not.toHaveBeenCalled();
      expect(
        screen.queryByRole("link", { name: "Открыть страницу" }),
      ).toBeNull();
      fireEvent.click(
        screen.getByRole("button", {
          name: "Подготовить восстановление публикации",
        }),
      );
      expect(props.onPreparePublicationRestore).toHaveBeenCalledOnce();
      expect(props.onApproveRollback).not.toHaveBeenCalled();
      expect(props.onRollback).not.toHaveBeenCalled();
    },
  );
  it("после успешной доставки сохраняет одну пару навигации без третьей публичной кнопки", () => {
    render(
      createElement(
        DataOperationCard,
        propsFor({
          ...publication,
          state: "applied",
          result: {
            page: draft.result!.page,
            adminUrl: draft.result!.adminUrl,
            publicUrl: "/delivery",
            delivery: { status: "succeeded" },
          },
        }),
      ),
    );
    expect(
      screen
        .getByRole("link", { name: "Посмотреть на фронте" })
        .getAttribute("href"),
    ).toBe(publication.frontendPreviewUrl);
    expect(screen.getAllByRole("link")).toHaveLength(2);
    expect(screen.queryByRole("link", { name: "Открыть страницу" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Подготовить предпросмотр" }),
    ).toBeNull();
  });
  it("восстановление имеет собственное подтверждение before/after и не использует generic rollback", () => {
    const operation: PagePublicationRestoreOperationDTO = {
      ...publication,
      kind: "pages.restorePublication.v1",
      rollbackStrategy: "none",
      preview: {
        ...publication.preview,
        before: publication.preview.after,
        after: publication.preview.before,
      },
    };
    const props = propsFor(operation);
    const { rerender } = render(createElement(DataOperationCard, props));
    expect(screen.getByText("Публикация будет снята")).toBeTruthy();
    expect(screen.getAllByRole("link")).toHaveLength(2);
    expect(screen.queryByRole("checkbox")).toBeNull();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Подтвердить восстановление публикации",
      }),
    );
    expect(props.onApprove).toHaveBeenCalledOnce();
    rerender(
      createElement(DataOperationCard, {
        ...props,
        operation: { ...operation, state: "approved" },
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Снять публикацию" }));
    expect(props.onApply).toHaveBeenCalledOnce();
    expect(props.onRollback).not.toHaveBeenCalled();
  });
  it("подготовка публикации доступна сразу после сохранения черновика без отдельного preview", () => {
    const onPreparePublication = vi.fn();
    const props = { ...propsFor(draft), onPreparePublication };
    const { rerender } = render(createElement(DataOperationCard, props));
    const prepare = () =>
      screen.getByRole("button", {
        name: "Подготовить публикацию",
      }) as HTMLButtonElement;
    expect(prepare().disabled).toBe(false);
    expect(
      screen
        .getByRole("link", { name: "Посмотреть в админке" })
        .getAttribute("href"),
    ).toBe(draft.result!.adminUrl);
    expect(
      screen.queryByRole("button", { name: "Подготовить предпросмотр" }),
    ).toBeNull();
    fireEvent.click(prepare());
    expect(onPreparePublication).toHaveBeenCalledOnce();
    expect(props.onApply).not.toHaveBeenCalled();
    expect(props.onApprove).not.toHaveBeenCalled();
    rerender(createElement(DataOperationCard, { ...props, pending: true }));
    expect(prepare().disabled).toBe(true);
    rerender(
      createElement(DataOperationCard, {
        ...props,
        operation: { ...draft, state: "rollback_approved" },
      }),
    );
    expect(
      screen.queryByRole("button", { name: "Подготовить публикацию" }),
    ).toBeNull();
  });
  it("показывает две серверные ссылки вне details и не засчитывает переходы как просмотр", () => {
    const props = propsFor({
      ...publication,
      adminUrl: "/control/collections/pages/17",
      frontendPreviewUrl: "/custom-api/realize-ai/data-operations/51/open-page",
    });
    render(createElement(DataOperationCard, props));
    const link = screen.getByRole("link", {
      name: "Посмотреть в админке",
    });
    const frontend = screen.getByRole("link", { name: "Посмотреть на фронте" });
    expect(link.getAttribute("href")).toBe("/control/collections/pages/17");
    expect(frontend.getAttribute("href")).toBe(
      "/custom-api/realize-ai/data-operations/51/open-page",
    );
    expect(screen.getAllByRole("link")).toHaveLength(2);
    for (const item of [link, frontend]) {
      expect(item.closest("details")).toBeNull();
      expect(item.getAttribute("target")).toBe("_blank");
      expect(item.getAttribute("rel")).toBe("noopener noreferrer");
      item.addEventListener("click", (event) => event.preventDefault());
      fireEvent.click(item);
    }
    expect(
      screen.getByText(
        /Предпросмотр также доступен в админке по кнопке с глазом/,
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "На фронте откроется предпросмотр текущего сохранённого черновика.",
      ),
    ).toBeTruthy();
    expect(
      screen
        .getAllByRole("checkbox")
        .every((el) => !(el as HTMLInputElement).checked),
    ).toBe(true);
    expect(approve().disabled).toBe(true);
    expect(props.onApprove).not.toHaveBeenCalled();
    expect(props.onApply).not.toHaveBeenCalled();
  });
});
