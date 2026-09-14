/**
 * @file src/blocks/RenderBlocks.tsx
 * @version 2.0.0
 * @date 2026-09-14
 * @description Отображает типизированные блоки обычной страницы витрины.
 */
import { ArchiveBlock } from "@/blocks/ArchiveBlock/Component";
import { BannerBlock } from "@/blocks/Banner/Component";
import { CallToActionBlock } from "@/blocks/CallToAction/Component";
import { CarouselBlock } from "@/blocks/Carousel/Component";
import { ContentBlock } from "@/blocks/Content/Component";
import { FormBlock } from "@/blocks/Form/Component";
import { MediaBlock } from "@/blocks/MediaBlock/Component";
import { ThreeItemGridBlock } from "@/blocks/ThreeItemGrid/Component";
import { toKebabCase } from "@/utilities/toKebabCase";
import React, { Fragment } from "react";

import type { RenderBlocksProps } from "./RenderBlocks.types";

/** Discriminant сохраняет связь блока с props renderer; generated nullable ID не передаётся как обязательный. */
const renderBlock = (block: RenderBlocksProps["blocks"][number]) => {
  const id =
    "id" in block
      ? block.id
      : typeof block.blockName === "string"
        ? toKebabCase(block.blockName)
        : undefined;
  switch (block.blockType) {
    case "archive":
      return <ArchiveBlock {...block} id={id} />;
    case "banner":
      return <BannerBlock {...block} id={id ?? undefined} />;
    case "carousel":
      return <CarouselBlock {...block} id={id} />;
    case "content":
      return <ContentBlock {...block} id={id} />;
    case "cta":
      return <CallToActionBlock {...block} id={id ?? undefined} />;
    case "mediaBlock":
      return <MediaBlock {...block} id={id ?? undefined} />;
    case "threeItemGrid":
      return <ThreeItemGridBlock {...block} id={id} />;
    case "formBlock": {
      if (!block.form || typeof block.form !== "object") return null;
      // Payload generated fields допускают null, Form Builder объявляет собственные типы.
      // Renderer принимает populated форму из штатного чтения страницы Payload.
      const form = block.form as unknown as React.ComponentProps<
        typeof FormBlock
      >["form"];
      return (
        <FormBlock
          {...block}
          blockName={block.blockName ?? undefined}
          id={id}
          form={form}
          enableIntro={block.enableIntro === true}
          introContent={block.introContent ?? undefined}
        />
      );
    }
    default:
      return null;
  }
};

export const RenderBlocks: React.FC<RenderBlocksProps> = (props) => {
  const { blocks } = props;
  if (!Array.isArray(blocks) || !blocks.length) return null;
  return (
    <Fragment>
      {blocks.map((block, index) => {
        const content = renderBlock(block);
        return content === null ? null : (
          <div className="my-16" key={index}>
            {content}
          </div>
        );
      })}
    </Fragment>
  );
};
