/**
 * @file packages/payload-ai-plugin/src/admin/chat/useProjectFilePicker.hook.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Загружает ограниченный каталог проекта с отменой устаревшего поиска.
 */

"use client";
import { useEffect, useState } from "react";
import type { ProjectContextFileDto } from "@realize/ai-contracts";
import { searchChatProjectFiles } from "./chatContextAPI.adapter";
export const useProjectFilePicker = () => {
  const [query, setQuery] = useState("");
  const [files, setFiles] = useState<ProjectContextFileDto[]>([]);
  const [isLoading, setLoading] = useState(true);
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState<string>();
  useEffect(() => {
    const request = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      setError(undefined);
      void searchChatProjectFiles(query, request.signal)
        .then((result) => {
          setFiles(result.files);
          setTruncated(result.truncated);
        })
        .catch((cause: unknown) => {
          if (!request.signal.aborted)
            setError(
              cause instanceof Error
                ? cause.message
                : "Не удалось загрузить файлы проекта.",
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
  }, [query]);
  return { query, setQuery, files, isLoading, truncated, error };
};
