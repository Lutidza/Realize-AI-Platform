/**
 * @file packages/payload-ai-plugin/src/admin/chat/usePageDraftPicker.hook.ts
 * @version 1.0.0
 * @date 2026-09-12
 * @description Загружает страницы для явного выбора с поиском, пагинацией и отменой старого запроса.
 */

"use client";
import { useEffect, useState } from "react";
import type { DataDocumentRefDTO } from "@realize/ai-contracts";
import { searchChatPageDrafts } from "./chatContextAPI.adapter";

export const usePageDraftPicker = () => {
  const [query, setQueryValue] = useState("");
  const [page, setPageValue] = useState(1);
  const [pages, setPages] = useState<DataDocumentRefDTO[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [totalDocs, setTotalDocs] = useState(0);
  const [isLoading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  useEffect(() => {
    const request = new AbortController();
    const timer = setTimeout(() => {
      void searchChatPageDrafts(query, page, request.signal)
        .then((result) => {
          if (request.signal.aborted) return;
          setPages(result.pages);
          setTotalPages(Math.max(1, result.totalPages));
          setTotalDocs(result.totalDocs);
        })
        .catch((cause: unknown) => {
          if (!request.signal.aborted)
            setError(
              cause instanceof Error
                ? cause.message
                : "Не удалось загрузить страницы.",
            );
        })
        .finally(() => {
          if (!request.signal.aborted) setLoading(false);
        });
    }, 200);
    return () => {
      clearTimeout(timer);
      request.abort();
    };
  }, [query, page]);
  return {
    query,
    setQuery: (value: string) => {
      if (value === query && page === 1) return;
      setLoading(true);
      setError(undefined);
      setQueryValue(value);
      setPageValue(1);
    },
    page,
    setPage: (value: number) => {
      if (value === page) return;
      setLoading(true);
      setError(undefined);
      setPageValue(value);
    },
    pages,
    totalPages,
    totalDocs,
    isLoading,
    error,
  };
};
