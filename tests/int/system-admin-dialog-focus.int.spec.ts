/**
 * @file tests/int/system-admin-dialog-focus.int.spec.ts
 * @version 1.0.0
 * @date 2026-09-17
 * @description Проверяет возврат фокуса после вложенного подтверждения и перехода в следующий диалог.
 * @see documentation/architecture/system-admin-shell.md
 */

import { createElement as h, Fragment, useState } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { UiDialog } from "../../packages/ui-kit/src/dialog/UiDialog.component";

function DialogFixture() {
  const [open, setOpen] = useState(false);
  const [discard, setDiscard] = useState(false);
  const [next, setNext] = useState(false);
  return h(
    Fragment,
    null,
    h("button", { onClick: () => setOpen(true) }, "Создать"),
    h(UiDialog, {
      open,
      mode: "light",
      title: "Редактор",
      onOpenChange: (value) => {
        if (!value) setDiscard(true);
      },
      footer: h(
        "button",
        {
          onClick: () => {
            setOpen(false);
            setNext(true);
          },
        },
        "Сохранить",
      ),
      children: h("input", { autoFocus: true, "aria-label": "Название" }),
    }),
    h(UiDialog, {
      open: discard,
      mode: "light",
      title: "Несохранённый черновик",
      onOpenChange: setDiscard,
      footer: h(
        Fragment,
        null,
        h("button", { onClick: () => setDiscard(false) }, "Продолжить"),
        h(
          "button",
          {
            onClick: () => {
              setDiscard(false);
              setOpen(false);
            },
          },
          "Отбросить",
        ),
      ),
      children: "Подтвердите закрытие",
    }),
    h(UiDialog, {
      open: next,
      mode: "light",
      title: "Созданная задача",
      onOpenChange: setNext,
      children: h("input", { autoFocus: true, "aria-label": "Комментарий" }),
    }),
  );
}

afterEach(cleanup);

describe("Фокус общего системного диалога", () => {
  it("возвращает focus launcher после одновременного закрытия формы с autoFocus и подтверждения", async () => {
    render(h(DialogFixture));
    const launcher = screen.getByRole("button", {
      name: "Создать",
    });
    launcher.focus();
    fireEvent.click(launcher);
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("textbox", { name: "Название" }),
      ),
    );
    fireEvent.keyDown(document, { key: "Escape" });
    const discard = await screen.findByRole("button", {
      name: "Отбросить",
    });
    discard.focus();
    fireEvent.click(discard);
    await waitFor(() => expect(document.activeElement).toBe(launcher));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("возвращает focus полю родителя при отмене вложенного подтверждения", async () => {
    render(h(DialogFixture));
    const launcher = screen.getByRole("button", {
      name: "Создать",
    });
    launcher.focus();
    fireEvent.click(launcher);
    const input = screen.getByRole("textbox", { name: "Название" });
    input.focus();
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(await screen.findByRole("button", { name: "Продолжить" }));
    await waitFor(() => expect(document.activeElement).toBe(input));
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
  });

  it("не перехватывает focus нового диалога после сохранения формы", async () => {
    render(h(DialogFixture));
    const launcher = screen.getByRole("button", {
      name: "Создать",
    });
    launcher.focus();
    fireEvent.click(launcher);
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    const nextInput = await screen.findByRole("textbox", {
      name: "Комментарий",
    });
    // Даём завершиться асинхронному cleanup закрытого FocusScope перед проверкой.
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(document.activeElement).toBe(nextInput);
    expect(screen.getByRole("dialog").textContent).toContain(
      "Созданная задача",
    );
  });
});
