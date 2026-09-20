/**
 * @file packages/ui-kit/src/system-admin-shell/useNavigationReorder.hook.ts
 * @version 1.1.0
 * @date 2026-09-17
 * @description Согласует native drag, точное место вставки и доступные команды порядка навигации.
 * @see documentation/architecture/system-admin-shell.md
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DragEvent } from "react";
import type {
  NavigationDropTarget,
  NavigationReorderProps,
} from "./SystemAdminNavigationCustomization.types";
import { createNavigationDragPreview } from "./createNavigationDragPreview.adapter";

const dragType = "application/x-realize-navigation-item";

/** Drag меняет порядок только при drop внутри списка; скрытые пункты и их состояние сохраняются. */
export function useNavigationReorder({
  items,
  preferences,
  onChange,
}: NavigationReorderProps) {
  const listRef = useRef<HTMLOListElement>(null);
  const sourceId = useRef<string | null>(null);
  const sourceOrder = useRef<string | null>(null);
  const clearPreview = useRef<(() => void) | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<NavigationDropTarget | null>(
    null,
  );
  const [announcement, setAnnouncement] = useState("");
  const orderKey = JSON.stringify(items.map((item) => item.id));
  const finish = useCallback(() => {
    sourceId.current = null;
    sourceOrder.current = null;
    clearPreview.current?.();
    clearPreview.current = null;
    setDraggingId(null);
    setDropTarget(null);
  }, []);

  useEffect(() => {
    const cancelOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && sourceId.current) finish();
    };
    const finishOutside = (event: globalThis.DragEvent) => {
      if (
        event.target instanceof Node &&
        !listRef.current?.contains(event.target)
      )
        finish();
    };
    const clearOutsideTarget = (event: globalThis.DragEvent) => {
      if (
        sourceId.current &&
        event.target instanceof Node &&
        !listRef.current?.contains(event.target)
      )
        setDropTarget(null);
    };
    window.addEventListener("keydown", cancelOnEscape, true);
    document.addEventListener("dragover", clearOutsideTarget);
    document.addEventListener("drop", finishOutside);
    document.addEventListener("dragend", finish);
    return () => {
      window.removeEventListener("keydown", cancelOnEscape, true);
      document.removeEventListener("dragover", clearOutsideTarget);
      document.removeEventListener("drop", finishOutside);
      document.removeEventListener("dragend", finish);
      sourceId.current = null;
      clearPreview.current?.();
    };
  }, [finish]);

  useEffect(() => {
    // Внешняя перестановка или смена каталога отменяет снимок начавшейся операции.
    if (sourceId.current && sourceOrder.current !== orderKey) {
      const frame = requestAnimationFrame(() => {
        if (sourceId.current && sourceOrder.current !== orderKey) finish();
      });
      return () => cancelAnimationFrame(frame);
    }
  }, [orderKey, finish]);

  const commit = (id: string, order: string[]) => {
    if (order.every((itemId, index) => items[index]?.id === itemId)) return;
    onChange({ ...preferences, order });
    const label = items.find((item) => item.id === id)?.label ?? id;
    setAnnouncement(
      `${label}: позиция ${order.indexOf(id) + 1} из ${order.length}.`,
    );
  };
  const move = (id: string, direction: -1 | 1) => {
    finish();
    const order = items.map((item) => item.id);
    const index = order.indexOf(id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= order.length) return;
    [order[index], order[target]] = [order[target], order[index]];
    commit(id, order);
  };
  const startDrag = (event: DragEvent<HTMLElement>, id: string) => {
    const row = event.currentTarget.closest<HTMLElement>(
      "[data-navigation-row]",
    );
    if (!row || !items.some((item) => item.id === id)) {
      event.preventDefault();
      return;
    }
    finish();
    sourceId.current = id;
    sourceOrder.current = orderKey;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(dragType, id);
    event.dataTransfer.setData("text/plain", id);
    clearPreview.current = createNavigationDragPreview({
      row,
      dataTransfer: event.dataTransfer,
      clientX: event.clientX,
      clientY: event.clientY,
    });
    setAnnouncement("");
    setDraggingId(id);
  };
  const accepts = (event: DragEvent<HTMLElement>) =>
    Boolean(
      sourceId.current &&
      sourceOrder.current === orderKey &&
      Array.from(event.dataTransfer.types).includes(dragType),
    );
  const resolveTarget = (clientY: number): NavigationDropTarget | null => {
    let target: NavigationDropTarget | null = null;
    let distance = Infinity;
    // Контейнер принимает также gap. Ближайший край соседних строк обозначает один slot.
    for (const row of listRef.current?.querySelectorAll<HTMLElement>(
      "[data-navigation-row]",
    ) ?? []) {
      const id = row.dataset.navigationRow;
      if (!id || !items.some((item) => item.id === id)) continue;
      const bounds = row.getBoundingClientRect();
      const nextDistance = Math.max(
        bounds.top - clientY,
        clientY - bounds.bottom,
        0,
      );
      if (nextDistance >= distance) continue;
      distance = nextDistance;
      target = {
        id,
        position: clientY < bounds.top + bounds.height / 2 ? "before" : "after",
      };
    }
    return target;
  };
  const dragOver = (event: DragEvent<HTMLElement>) => {
    if (!accepts(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const next = resolveTarget(event.clientY);
    setDropTarget((current) =>
      current?.id === next?.id && current?.position === next?.position
        ? current
        : next,
    );
  };
  const drop = (event: DragEvent<HTMLElement>) => {
    if (!accepts(event)) {
      finish();
      return;
    }
    event.preventDefault();
    const source = sourceId.current;
    const target = resolveTarget(event.clientY);
    if (
      source &&
      target &&
      source !== target.id &&
      event.dataTransfer.getData(dragType) === source
    ) {
      const order = items.map((item) => item.id).filter((id) => id !== source);
      order.splice(
        order.indexOf(target.id) + (target.position === "after" ? 1 : 0),
        0,
        source,
      );
      commit(source, order);
    }
    finish();
  };
  const sourceLabel = items.find((item) => item.id === draggingId)?.label;
  const targetLabel = items.find((item) => item.id === dropTarget?.id)?.label;
  const dragStatus = sourceLabel
    ? targetLabel && dropTarget?.id !== draggingId
      ? `«${sourceLabel}» → ${dropTarget?.position === "before" ? "перед" : "после"} «${targetLabel}».`
      : `Перемещаем «${sourceLabel}». Выберите место в списке.`
    : announcement ||
      "Перетащите раздел за маркер или измените порядок стрелками.";
  return {
    listRef,
    draggingId,
    dropTarget,
    dragStatus,
    move,
    startDrag,
    dragOver,
    drop,
    finish,
  };
}
