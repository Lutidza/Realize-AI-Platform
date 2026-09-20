/**
 * @file src/components/admin/task-manager/reference/useTaskPeoplePicker.hook.ts
 * @version 1.0.0
 * @date 2026-09-17
 * @description Управляет состоянием, размещением и клавиатурным закрытием выбора участников.
 * @see documentation/specifications/task-management.md
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";

/** Измерение clipping-контейнеров выполняется после layout; события очищаются при закрытии списка. */
export function useTaskPeoplePicker() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [placement, setPlacement] = useState({
    side: "bottom",
    maxHeight: 360,
  });
  const root = useRef<HTMLDetailsElement>(null);
  useLayoutEffect(() => {
    if (!open) return;
    const measure = () => {
      if (!root.current) return;
      const anchor = root.current.getBoundingClientRect();
      let top = 0;
      let bottom = window.innerHeight;
      // Пересечение scroll/clipping-контейнеров исключает область закреплённого footer.
      for (
        let parent = root.current.parentElement;
        parent;
        parent = parent.parentElement
      ) {
        if (
          !/(auto|scroll|hidden|clip)/.test(getComputedStyle(parent).overflowY)
        )
          continue;
        const bounds = parent.getBoundingClientRect();
        top = Math.max(top, bounds.top + parent.clientTop);
        bottom = Math.min(
          bottom,
          bounds.top + parent.clientTop + parent.clientHeight,
        );
      }
      const above = Math.max(0, anchor.top - top - 8);
      const below = Math.max(0, bottom - anchor.bottom - 8);
      const side = below < 320 && above > below ? "top" : "bottom";
      const maxHeight = Math.floor(
        Math.min(360, side === "top" ? above : below),
      );
      setPlacement((previous) =>
        previous.side === side && previous.maxHeight === maxHeight
          ? previous
          : { side, maxHeight },
      );
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target))
        setOpen(false);
    };
    // Radix слушает Escape на document capture; сначала закрываем вложенный picker.
    const closeOnEscape = (event: KeyboardEvent) => {
      if (
        event.key !== "Escape" ||
        !(event.target instanceof Node) ||
        !root.current?.contains(event.target)
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      root.current.querySelector("summary")?.focus();
    };
    document.addEventListener("pointerdown", closeOutside);
    window.addEventListener("keydown", closeOnEscape, true);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      window.removeEventListener("keydown", closeOnEscape, true);
    };
  }, [open]);
  const toggle = () => {
    setOpen((previous) => !previous);
    setQuery("");
  };
  return { root, open, query, setQuery, placement, toggle };
}
