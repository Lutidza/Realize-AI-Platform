/**
 * @file src/blocks/Content/mapAIContentBlock.mapper.ts
 * @version 1.0.0
 * @date 2026-09-13
 * @description Преобразует текстовую секцию AI в одну полную колонку Content.
 */
import type { CreatePageDraftIntent } from "@realize/ai-contracts";
import { mapPlainTextRichText } from "@/fields/mapPlainTextRichText.mapper";

export const mapAIContentBlock = (
  section: CreatePageDraftIntent["sections"][number],
) => ({
  blockType: "content" as const,
  columns: [
    {
      size: "full" as const,
      enableLink: false,
      richText: mapPlainTextRichText([
        ...(section.heading
          ? [
              {
                type: "heading" as const,
                text: section.heading,
                tag: "h2" as const,
              },
            ]
          : []),
        ...section.body
          .split("\n")
          .map((text) => ({ type: "paragraph" as const, text })),
      ]),
    },
  ],
});
