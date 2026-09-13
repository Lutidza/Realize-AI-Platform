/**
 * @file tests/int/dataOperationCard.int.spec.ts
 * @version 1.1.0
 * @date 2026-09-12
 * @description Проверяет подтверждение создания черновика, результат, безопасный откат и сохранение карточки каталога.
 */

import type {
  CategoryAssignmentOperationDTO,
  PageDraftCreationOperationDTO,
  PageDraftUpdateOperationDTO,
} from "@realize/ai-contracts";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DataOperationCard } from "../../packages/payload-ai-plugin/src/admin/DataOperationCard";
import type { DataOperationCardProps } from "../../packages/payload-ai-plugin/src/admin/DataOperationCard.types";

afterEach(cleanup);

const page: PageDraftCreationOperationDTO = {
  id: "41",
  conversationID: "7",
  sourceMessageID: "12",
  createdAt: "2026-09-11T10:00:00Z",
  updatedAt: "2026-09-11T10:00:00Z",
  expiresAt: "2099-09-11T10:00:00Z",
  operationHash: "a".repeat(64),
  rollbackHash: "b".repeat(64),
  estimatedCount: 1,
  riskLevel: "R1",
  version: 1,
  state: "awaiting_approval",
  title: "Создать страницу «О компании»",
  kind: "pages.createDraft.v1",
  rollbackStrategy: "delete-created-draft",
  preview: {
    title: "О компании",
    slug: "about",
    status: "draft",
    description: "Знакомство с компанией",
    sections: [
      { heading: "Наша история", body: "Первая строка\nВторая строка" },
      { body: "<script>alert('demo')</script>" },
    ],
  },
};

const propsFor = (
  operation: DataOperationCardProps["operation"] = page,
): DataOperationCardProps => ({
  operation,
  pending: false,
  onApply: vi.fn(),
  onApprove: vi.fn(),
  onApproveRollback: vi.fn(),
  onReject: vi.fn(),
  onRollback: vi.fn(),
  onDraftChange: vi.fn(),
});

describe("Карточка создания черновика страницы", () => {
  it("показывает точный diff существующей страницы и раздельные подтверждение, запись и восстановление", () => {
    const operation: PageDraftUpdateOperationDTO = {
      ...page,
      kind: "pages.updateDraft.v1",
      title: "Изменить текст страницы",
      rollbackStrategy: "before-snapshot",
      expectedTargetUpdatedAt: "2026-09-12T10:00:00Z",
      preview: {
        page: { id: "17", title: "О компании", slug: "about" },
        status: "draft",
        changes: [
          {
            path: "title",
            label: "Название",
            before: "  Прежний заголовок\nВторая строка",
            after: "<script>Новый заголовок</script>",
          },
          {
            path: "meta.description",
            label: "SEO-описание",
            before: "Описание",
            after: "",
          },
        ],
      },
    };
    const props = propsFor(operation);
    const { container, rerender } = render(
      createElement(DataOperationCard, props),
    );
    expect(
      screen.getByRole("region", { name: "Изменение 1: Название" }),
    ).toBeTruthy();
    expect(container.querySelector("dd")?.textContent).toBe(
      "  Прежний заголовок\nВторая строка",
    );
    expect(screen.getByText("<script>Новый заголовок</script>")).toBeTruthy();
    expect(container.querySelector("script")).toBeNull();
    expect(screen.getByText("Пустое значение")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Подтвердить изменения" }),
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
    const applied = {
      ...operation,
      state: "applied" as const,
      result: {
        page: { id: "17", title: "Новый заголовок" },
        adminUrl: "/admin/collections/pages/17",
      },
    };
    rerender(
      createElement(DataOperationCard, { ...props, operation: applied }),
    );
    expect(screen.getByText("Черновик обновлён")).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "Открыть черновик" })
        .getAttribute("href"),
    ).toBe(applied.result.adminUrl);
    expect(screen.queryByText("Удалить созданный черновик")).toBeNull();
    expect(screen.queryByText("Назначить категорию")).toBeNull();
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
      screen.getByRole("button", { name: "Восстановить содержимое" }),
    );
    expect(props.onRollback).toHaveBeenCalledOnce();
    rerender(
      createElement(DataOperationCard, {
        ...props,
        operation: { ...applied, state: "rolled_back" },
      }),
    );
    expect(screen.getByText("Содержимое восстановлено")).toBeTruthy();
    expect(screen.queryByText("Черновик удалён")).toBeNull();
  });
  it("показывает полное содержание как текст и подтверждает отдельно от записи", () => {
    const props = propsFor();
    const { container, rerender } = render(
      createElement(DataOperationCard, props),
    );
    expect(screen.getByText("/about")).toBeTruthy();
    expect(screen.getByText("Черновик · не опубликован")).toBeTruthy();
    expect(screen.getByText("Знакомство с компанией")).toBeTruthy();
    expect(screen.getByText("Наша история")).toBeTruthy();
    expect(screen.getByText("Первая строка Вторая строка")).toBeTruthy();
    expect(screen.getByText("<script>alert('demo')</script>")).toBeTruthy();
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("details")?.open).toBe(true);
    expect(
      screen.queryByRole("button", { name: "Создать черновик" }),
    ).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Подтвердить создание" }),
    );
    expect(props.onApprove).toHaveBeenCalledOnce();
    expect(props.onApply).not.toHaveBeenCalled();

    rerender(
      createElement(DataOperationCard, {
        ...props,
        operation: { ...page, state: "approved", version: 2 },
      }),
    );
    expect(
      screen.queryByRole("button", { name: "Подтвердить создание" }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Создать черновик" }));
    expect(props.onApply).toHaveBeenCalledOnce();
  });

  it("показывает сохранённый черновик и требует отдельное подтверждение удаления", () => {
    const applied: PageDraftCreationOperationDTO = {
      ...page,
      state: "applied",
      version: 3,
      result: {
        page: { id: "99", title: "О компании", slug: "about" },
        adminUrl: "/custom-admin/collections/pages/99",
      },
    };
    const props = propsFor(applied);
    const { rerender } = render(createElement(DataOperationCard, props));
    expect(screen.getByText("Черновик создан")).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "Открыть черновик" })
        .getAttribute("href"),
    ).toBe("/custom-admin/collections/pages/99");
    expect(
      screen.queryByRole("button", { name: "Создать черновик" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Удалить черновик" }),
    ).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Подтвердить удаление" }),
    );
    expect(props.onApproveRollback).toHaveBeenCalledOnce();
    expect(props.onRollback).not.toHaveBeenCalled();

    rerender(
      createElement(DataOperationCard, {
        ...props,
        operation: { ...applied, state: "rollback_approved", version: 4 },
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Удалить черновик" }));
    expect(props.onRollback).toHaveBeenCalledOnce();
    rerender(
      createElement(DataOperationCard, {
        ...props,
        operation: { ...applied, state: "rolled_back", version: 5 },
      }),
    );
    expect(screen.getByText("Черновик удалён")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Открыть черновик" })).toBeNull();
  });

  it("блокирует повторное действие во время запроса и показывает причину неудачи", () => {
    const props = propsFor({ ...page, state: "approved" });
    const { rerender } = render(
      createElement(DataOperationCard, { ...props, pending: true }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Создаём…" }));
    expect(props.onApply).not.toHaveBeenCalled();
    rerender(
      createElement(DataOperationCard, {
        ...props,
        operation: {
          ...page,
          state: "apply_failed",
          errorSummary: "Адрес about уже занят.",
        },
      }),
    );
    expect(screen.getByText("Адрес about уже занят.")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Создать черновик" }),
    ).toBeNull();
    expect(screen.queryByRole("link", { name: "Открыть черновик" })).toBeNull();
  });

  it("истёкшее предложение нельзя подтвердить, отклонение сохраняет причину", () => {
    const props = propsFor({ ...page, expiresAt: "2000-01-01T00:00:00Z" });
    const { rerender } = render(createElement(DataOperationCard, props));
    expect(screen.getByText("Срок подтверждения истёк")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Подтвердить создание" }),
    ).toBeNull();
    rerender(createElement(DataOperationCard, { ...props, operation: page }));
    fireEvent.click(screen.getByRole("button", { name: "Отклонить" }));
    fireEvent.change(screen.getByLabelText("Причина отклонения"), {
      target: { value: "Изменить содержание" },
    });
    expect(props.onDraftChange).toHaveBeenLastCalledWith(true);
    fireEvent.click(
      screen.getByRole("button", { name: "Отклонить с причиной" }),
    );
    expect(props.onReject).toHaveBeenCalledWith("Изменить содержание");
  });

  it("сохраняет предпросмотр и применение категории товара", () => {
    const product = { id: "15", title: "Кружка", slug: "cup" };
    const category = { id: "8", title: "Посуда", slug: "tableware" };
    const catalog: CategoryAssignmentOperationDTO = {
      ...page,
      title: "Назначить категорию товару",
      kind: "catalog.assignCategory.v1",
      rollbackStrategy: "before-snapshot",
      expectedTargetUpdatedAt: "2026-09-11T10:00:00Z",
      state: "approved",
      preview: {
        product,
        category,
        beforeCategories: [],
        afterCategories: [category],
        addedCategories: [category],
      },
    };
    const props = propsFor(catalog);
    render(createElement(DataOperationCard, props));
    expect(screen.getByText("Кружка · cup")).toBeTruthy();
    expect(screen.getByText("Посуда")).toBeTruthy();
    expect(screen.queryByText("Черновик · не опубликован")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Шаг 3 · Применить" }));
    expect(props.onApply).toHaveBeenCalledOnce();
  });
});
