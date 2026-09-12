/**
 * @file packages/payload-ai-plugin/src/admin/chat/useChatAgentConfigurationPicker.hook.ts
 * @version 1.1.0
 * @date 2026-09-11
 * @description Ограничивает поиск и страницы каталогов профилей и процессов в компактном composer.
 */

"use client";
import { useState } from "react";
import type { AIChatConfigurationCatalogDTO } from "@realize/ai-contracts";

export const useChatAgentConfigurationPicker = (catalog?: {
  profiles: readonly Pick<
    AIChatConfigurationCatalogDTO["profiles"][number],
    "key" | "title" | "description"
  >[];
}) => {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const search = query.trim().toLowerCase();
  const filtered = (catalog?.profiles ?? []).filter((profile) =>
    `${profile.title} ${profile.key} ${profile.description}`
      .toLowerCase()
      .includes(search),
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / 25));
  const currentPage = Math.min(page, pageCount);
  return {
    query,
    page: currentPage,
    pageCount,
    count: filtered.length,
    rows: filtered.slice((currentPage - 1) * 25, currentPage * 25),
    setPage,
    setQuery: (value: string) => {
      setQuery(value);
      setPage(1);
    },
  };
};
