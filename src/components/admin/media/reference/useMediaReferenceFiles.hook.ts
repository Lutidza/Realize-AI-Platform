/**
 * @file src/components/admin/media/reference/useMediaReferenceFiles.hook.ts
 * @version 1.0.0
 * @date 2026-09-14
 * @description Владение локальными файлами и освобождение object URLs.
 * @see documentation/specifications/media-management-references.md
 */

import { useEffect, useRef, useState } from "react";
import type { Asset } from "./MediaReference.types";

/** Файлы живут до удаления или размонтирования корня, без сетевой передачи. */
export function useMediaReferenceFiles(denied: boolean) {
  const files = useRef(new Map<string, { file: File; url?: string }>());
  const [assets, setAssets] = useState<Asset[]>([]);
  useEffect(() => {
    const owned = files.current;
    return () => {
      owned.forEach(({ url }) => {
        if (url) URL.revokeObjectURL(url);
      });
      owned.clear();
    };
  }, []);
  function add(incoming: File[]) {
    if (denied) return false;
    const added = incoming.map((file): Asset => {
      const id = `local-${crypto.randomUUID()}`;
      const kind = file.type.startsWith("image/") ? "image" : "other";
      let url: string | undefined;
      let previewError = false;
      try {
        if (kind === "image") url = URL.createObjectURL(file);
      } catch {
        previewError = true;
      }
      files.current.set(id, { file, url });
      return {
        id,
        name: file.name,
        kind,
        url,
        previewError,
        size: file.size,
        local: true,
        purpose: "Контент",
        folder: "Контент",
        date: new Date().toISOString(),
        alt: "",
        caption: "",
      };
    });
    setAssets((current) => [...added, ...current]);
    return added.length > 0;
  }
  function remove(id: string) {
    if (denied) return;
    const owned = files.current.get(id);
    if (owned?.url) URL.revokeObjectURL(owned.url);
    files.current.delete(id);
    setAssets((current) => current.filter((asset) => asset.id !== id));
  }
  return { assets, add, remove };
}
