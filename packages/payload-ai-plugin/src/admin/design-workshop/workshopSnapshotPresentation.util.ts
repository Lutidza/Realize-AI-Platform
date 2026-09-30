/**
 * @file packages/payload-ai-plugin/src/admin/design-workshop/workshopSnapshotPresentation.util.ts
 * @version 1.0.0
 * @date 2026-09-25
 * @description Отображает полный бриф и материалы в сравнении версий без технических JSON-полей.
 * @see documentation/specifications/design-workshop.md
 */
import type { DesignBrief, DesignSource } from "@realize/ai-contracts";
import { WORKSHOP_BRIEF_LABELS } from "./designWorkshopClient.constants";

export function workshopBriefText(brief: DesignBrief): string {
  return (Object.keys(WORKSHOP_BRIEF_LABELS) as (keyof DesignBrief)[])
    .map((key) => {
      const value = brief[key];
      return (
        WORKSHOP_BRIEF_LABELS[key] +
        "\n" +
        (Array.isArray(value)
          ? value.map((item) => "• " + item).join("\n") || "Не заданы"
          : value)
      );
    })
    .join("\n\n");
}

export function workshopSourcesText(sources: DesignSource[]): string {
  return (
    sources
      .map(
        (source) =>
          source.title +
          "\n" +
          (source.kind === "link" ? source.url : source.text),
      )
      .join("\n\n") || "Материалов нет"
  );
}
