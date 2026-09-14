/**
 * @file tests/int/renderBlocks.int.spec.ts
 * @version 1.0.1
 * @date 2026-09-14
 * @description Проверяет прежние DOM ID блоков общего отображения витрины.
 */
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RenderBlocks } from "../../src/blocks/RenderBlocks";

vi.mock("@/blocks/ArchiveBlock/Component", () => ({
  ArchiveBlock: ({ id }: { id?: string | null }) =>
    React.createElement("div", { id: `block-${id}`, "data-testid": "archive" }),
}));
vi.mock("@/blocks/Banner/Component", () => ({ BannerBlock: () => null }));
vi.mock("@/blocks/CallToAction/Component", () => ({
  CallToActionBlock: () => null,
}));
vi.mock("@/blocks/Carousel/Component", () => ({ CarouselBlock: () => null }));
vi.mock("@/blocks/Content/Component", () => ({ ContentBlock: () => null }));
vi.mock("@/blocks/Form/Component", () => ({ FormBlock: () => null }));
vi.mock("@/blocks/MediaBlock/Component", () => ({ MediaBlock: () => null }));
vi.mock("@/blocks/ThreeItemGrid/Component", () => ({
  ThreeItemGridBlock: () => null,
}));

afterEach(cleanup);

describe("Общий renderer Pages", () => {
  it("сохраняет ID, null, explicit undefined и прежний fallback blockName", () => {
    render(
      React.createElement(RenderBlocks, {
        blocks: [
          { blockType: "archive", id: "stable", blockName: "Ignored name" },
          { blockType: "archive", id: null, blockName: "Ignored null" },
          {
            blockType: "archive",
            id: undefined,
            blockName: "Ignored undefined",
          },
          { blockType: "archive", blockName: "My section" },
          { blockType: "archive", blockName: "" },
        ],
      }),
    );
    expect(
      screen.getAllByTestId("archive").map((element) => element.id),
    ).toEqual([
      "block-stable",
      "block-null",
      "block-undefined",
      "block-my-section",
      "block-",
    ]);
  });
});
