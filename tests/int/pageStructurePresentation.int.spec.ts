/**
 * @file tests/int/pageStructurePresentation.int.spec.ts
 * @version 1.1.0
 * @date 2026-09-14
 * @description Проверяет полный структурный preview и раздельные действия подтверждения, записи и восстановления.
 */
import type { PageDraftStructureOperationDTO } from "@realize/ai-contracts";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DataOperationCard } from "../../packages/payload-ai-plugin/src/admin/DataOperationCard";
import type { DataOperationCardProps } from "../../packages/payload-ai-plugin/src/admin/DataOperationCard.types";

afterEach(cleanup);

const operation: PageDraftStructureOperationDTO = {
  id: "41",
  conversationID: "7",
  sourceMessageID: "12",
  createdAt: "2026-09-13T10:00:00Z",
  updatedAt: "2026-09-13T10:00:00Z",
  expiresAt: "2099-09-13T10:00:00Z",
  operationHash: "a".repeat(64),
  rollbackHash: "b".repeat(64),
  estimatedCount: 1,
  riskLevel: "R1",
  version: 1,
  state: "awaiting_approval",
  title: "Изменить структуру «Доставка»",
  kind: "pages.updateStructureDraft.v1",
  rollbackStrategy: "before-snapshot",
  expectedTargetUpdatedAt: "2026-09-13T10:00:00Z",
  preview: {
    page: { id: "17", title: "Доставка", slug: "delivery" },
    status: "draft",
    action: "remove",
    blockID: "content-a",
    beforeIndex: 1,
    afterIndex: null,
    totalBefore: 3,
    totalAfter: 2,
    beforeBlockID: null,
    content: {
      columns: [
        { size: "half", text: "  Первая строка\nВторая строка  " },
        { size: "half", text: "<script>Это текст, который исчезнет</script>" },
      ],
    },
  },
};
const propsFor = (value = operation): DataOperationCardProps => ({
  operation: value,
  pending: false,
  onApply: vi.fn(),
  onApprove: vi.fn(),
  onApproveRollback: vi.fn(),
  onReject: vi.fn(),
  onRollback: vi.fn(),
  onDraftChange: vi.fn(),
});

describe("структурный preview Content", () => {
  it("показывает полный удаляемый текст всех колонок, сохраняя пробелы и безопасность HTML", () => {
    const complete = `${"Полное содержимое. ".repeat(250)}Последняя важная строка`;
    const props = propsFor({
      ...operation,
      preview: {
        ...operation.preview,
        content: {
          blockName: "Условия доставки",
          columns: [
            ...operation.preview.content!.columns,
            { size: "full", text: complete },
          ],
        },
      },
    });
    const { container } = render(createElement(DataOperationCard, props));
    expect(screen.getByText("Позиция 2 из 3")).toBeTruthy();
    expect(screen.getByText("Блок будет удалён")).toBeTruthy();
    expect(screen.getByText("Количество блоков: 3 → 2.")).toBeTruthy();
    const removed = screen.getByRole("region", {
      name: "Содержимое удаляемого блока",
    });
    expect(within(removed).getByText("Условия доставки")).toBeTruthy();
    expect(removed.querySelector("dd")?.textContent).toBe(
      "  Первая строка\nВторая строка  ",
    );
    expect(within(removed).getByText(complete).textContent).toBe(complete);
    expect(
      screen.getByText("<script>Это текст, который исчезнет</script>"),
    ).toBeTruthy();
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("details")?.open).toBe(true);
    expect(screen.queryByText("Назначить категорию")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Сохранить черновик" }),
    ).toBeNull();
  });
  it("показывает вставку перед точным якорем и весь новый текст", () => {
    render(
      createElement(
        DataOperationCard,
        propsFor({
          ...operation,
          preview: {
            ...operation.preview,
            action: "insert",
            blockID: "new-content",
            beforeIndex: null,
            afterIndex: 1,
            totalAfter: 4,
            beforeBlockID: "form-block",
            content: {
              columns: [
                { size: "full", text: "Новый раздел\nНовый полный текст" },
              ],
            },
          },
        }),
      ),
    );
    expect(screen.getByText("Блока ещё нет")).toBeTruthy();
    expect(screen.getByText("Позиция 2 из 4")).toBeTruthy();
    expect(screen.getByText("form-block")).toBeTruthy();
    expect(
      screen.getByRole("region", { name: "Содержимое нового блока" })
        .textContent,
    ).toContain("Новый раздел\nНовый полный текст");
  });
  it("показывает перемещение к концу большой страницы без рендера всех блоков", () => {
    const { container } = render(
      createElement(
        DataOperationCard,
        propsFor({
          ...operation,
          preview: {
            ...operation.preview,
            action: "move",
            beforeIndex: 1,
            afterIndex: 9_999,
            totalBefore: 10_000,
            totalAfter: 10_000,
            content: undefined,
          },
        }),
      ),
    );
    expect(screen.getByText("Позиция 2 из 10000")).toBeTruthy();
    expect(screen.getByText("Позиция 10000 из 10000")).toBeTruthy();
    expect(screen.getByText("Размещение: в конце страницы.")).toBeTruthy();
    expect(
      screen.queryByRole("region", { name: "Содержимое удаляемого блока" }),
    ).toBeNull();
    expect(container.querySelectorAll("dd")).toHaveLength(2);
  });
  it("не объединяет подтверждение, запись и откат структуры в одно действие", () => {
    const props = propsFor();
    const { rerender } = render(createElement(DataOperationCard, props));
    fireEvent.click(
      screen.getByRole("button", { name: "Подтвердить изменение структуры" }),
    );
    expect(props.onApprove).toHaveBeenCalledOnce();
    expect(props.onApply).not.toHaveBeenCalled();
    rerender(
      createElement(DataOperationCard, {
        ...props,
        operation: { ...operation, state: "approved" },
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Сохранить черновик" }));
    expect(props.onApply).toHaveBeenCalledOnce();
    const applied: PageDraftStructureOperationDTO = {
      ...operation,
      state: "applied",
      result: {
        page: operation.preview.page,
        adminUrl: "/custom-admin/collections/pages/17",
        frontendPreviewUrl:
          "/custom-api/realize-ai/data-operations/17/open-page",
      },
    };
    rerender(
      createElement(DataOperationCard, { ...props, operation: applied }),
    );
    expect(
      screen
        .getByRole("link", { name: "Посмотреть в админке" })
        .getAttribute("href"),
    ).toBe(applied.result!.adminUrl);
    fireEvent.click(
      screen.getByRole("button", { name: "Подтвердить восстановление" }),
    );
    expect(props.onApproveRollback).toHaveBeenCalledOnce();
    expect(props.onRollback).not.toHaveBeenCalled();
    rerender(
      createElement(DataOperationCard, {
        ...props,
        operation: { ...applied, state: "rollback_approved" },
      }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Восстановить структуру" }),
    );
    expect(props.onRollback).toHaveBeenCalledOnce();
    rerender(
      createElement(DataOperationCard, {
        ...props,
        operation: { ...applied, state: "rolled_back" },
      }),
    );
    expect(screen.getByText("Структура восстановлена")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Удалить черновик" }),
    ).toBeNull();
  });
  it("блокирует повторное действие, пока предыдущая операция выполняется", () => {
    const props = { ...propsFor(), pending: true };
    render(createElement(DataOperationCard, props));
    for (const button of screen.getAllByRole("button"))
      expect(button.hasAttribute("disabled")).toBe(true);
    expect(props.onApply).not.toHaveBeenCalled();
  });
});
