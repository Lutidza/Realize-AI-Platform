/**
 * @file tests/int/formBlock.int.spec.ts
 * @version 1.0.1
 * @date 2026-09-14
 * @description Проверяет штатную отправку формы витрины после удаления отдельного режима агента.
 */
import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FormBlockProps } from "../../src/blocks/Form/Component.types";
import { FormBlock } from "../../src/blocks/Form/Component";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/RichText", () => ({ RichText: () => null }));

const props: FormBlockProps = {
  enableIntro: false,
  form: {
    id: "contact-form",
    title: "Обратная связь",
    emails: [],
    fields: [
      { blockType: "text", name: "name", label: "Имя", required: false },
    ],
    submitButtonLabel: "Отправить",
    confirmationType: "message",
  },
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Форма витрины", () => {
  it("сохраняет прежний DOM и POST обычной формы", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue({ status: 200, json: async () => ({}) });
    vi.stubGlobal("fetch", fetch);
    const view = render(React.createElement(FormBlock, props));
    expect(view.container.querySelector("fieldset")).toBeNull();
    fireEvent.change(screen.getByLabelText("Имя"), {
      target: { value: "Ирина" },
    });
    fireEvent.submit(view.container.querySelector("form")!);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const [url, request] = fetch.mock.calls[0];
    expect(url).toMatch(/\/api\/form-submissions$/);
    expect(request.method).toBe("POST");
    expect(JSON.parse(request.body)).toEqual({
      form: "contact-form",
      submissionData: [{ field: "name", value: "Ирина" }],
    });
  });
});
