/**
 * @file tests/int/ui-confirmation.int.spec.ts
 * @version 1.0.0
 * @date 2026-09-18
 * @description Проверяет явное подтверждение, отмену, блокировку и focus общего примитива.
 * @see documentation/architecture/ui-kit.md
 */
import { createElement as h, Fragment, useState } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UiConfirmation } from "../../packages/ui-kit/src/dialog/UiConfirmation.component";
import type { UiConfirmationProps } from "../../packages/ui-kit/src/dialog/UiConfirmation.types";

const defaults: UiConfirmationProps = {
  open: true,
  mode: "light",
  title: "Удалить папку?",
  subject: "Материалы",
  description: "Задач: 2. Отменить нельзя.",
  confirmLabel: "Удалить",
  tone: "danger",
  onConfirm: () => undefined,
  onOpenChange: () => undefined,
};

afterEach(cleanup);

describe("Общее подтверждение действия", () => {
  it("именует alertdialog, фокусирует отмену и вызывает действие только явно", async () => {
    const confirm = vi.fn();
    render(h(UiConfirmation, { ...defaults, onConfirm: confirm }));
    const dialog = screen.getByRole("alertdialog", { name: "Удалить папку?" });
    expect(dialog.textContent).toContain("Материалы");
    expect(dialog.getAttribute("aria-describedby")).toBeTruthy();
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: "Отмена" }),
      ),
    );
    expect(confirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Удалить" }));
    expect(confirm).toHaveBeenCalledTimes(1);
    // Результат принадлежит host; примитив не имитирует успех и не закрывается сам.
    expect(screen.getByRole("alertdialog")).toBeTruthy();
  });

  it("показывает причину запрета и только безопасное закрытие", () => {
    const confirm = vi.fn();
    const close = vi.fn();
    render(
      h(UiConfirmation, {
        ...defaults,
        blockedReason: "Есть активное исполнение.",
        onConfirm: confirm,
        onOpenChange: close,
      }),
    );
    expect(screen.getByRole("alertdialog").textContent).toContain(
      "Есть активное исполнение.",
    );
    expect(screen.queryByRole("button", { name: "Удалить" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Понятно" }));
    expect(close).toHaveBeenCalledWith(false);
    expect(confirm).not.toHaveBeenCalled();
  });

  it("блокирует повтор и закрытие во время выполнения", () => {
    const confirm = vi.fn();
    const close = vi.fn();
    render(
      h(UiConfirmation, {
        ...defaults,
        pending: true,
        onConfirm: confirm,
        onOpenChange: close,
      }),
    );
    const cancel = screen.getByRole("button", {
      name: "Отмена",
    }) as HTMLButtonElement;
    expect(cancel.disabled).toBe(true);
    fireEvent.click(cancel);
    fireEvent.click(screen.getByRole("button", { name: "Выполняется…" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(confirm).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
  });

  it("объявляет ошибку и позволяет явно повторить действие", () => {
    const confirm = vi.fn();
    render(
      h(UiConfirmation, {
        ...defaults,
        error: "Не удалось сохранить изменения.",
        onConfirm: confirm,
      }),
    );
    expect(screen.getByRole("alert").textContent).toContain(
      "Не удалось сохранить",
    );
    fireEvent.click(screen.getByRole("button", { name: "Удалить" }));
    expect(confirm).toHaveBeenCalledTimes(1);
  });

  it("Escape отменяет действие и возвращает focus открывшей кнопке", async () => {
    const confirm = vi.fn();
    function Fixture() {
      const [open, setOpen] = useState(false);
      return h(
        Fragment,
        null,
        h("button", { onClick: () => setOpen(true) }, "Действия папки"),
        h(UiConfirmation, {
          ...defaults,
          open,
          onConfirm: confirm,
          onOpenChange: setOpen,
        }),
      );
    }
    render(h(Fixture));
    const launcher = screen.getByRole("button", { name: "Действия папки" });
    launcher.focus();
    fireEvent.click(launcher);
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: "Отмена" }),
      ),
    );
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(document.activeElement).toBe(launcher));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(confirm).not.toHaveBeenCalled();
  });
});
