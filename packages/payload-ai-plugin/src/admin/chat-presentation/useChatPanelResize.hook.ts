/**
 * @file packages/payload-ai-plugin/src/admin/chat-presentation/useChatPanelResize.hook.ts
 * @version 1.0.0
 * @date 2026-09-10
 * @description Меняет ширину правой панели и отступ содержимого без перерисовки provider на каждом движении.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import type { ChatHostProps, ChatPanelDrag } from "./ChatPanel.types";

const MIN_WIDTH = 360;
const MAX_WIDTH = 960;
const MOBILE_WIDTH = 900;
const WIDTH_PROPERTY = "--realize-chat-preferred-width";

export const useChatPanelResize = ({ rootRef }: ChatHostProps) => {
  const drag = useRef<ChatPanelDrag | null>(null);
  const [size, setSize] = useState({
    min: MIN_WIDTH,
    max: MAX_WIDTH,
    value: 512,
  });

  const measure = useCallback(() => {
    const viewport = window.innerWidth;
    const min = viewport <= MOBILE_WIDTH ? viewport : MIN_WIDTH;
    const max =
      viewport <= MOBILE_WIDTH
        ? viewport
        : Math.min(MAX_WIDTH, viewport - MIN_WIDTH);
    const preferred = Number.parseFloat(
      rootRef.current?.style.getPropertyValue(WIDTH_PROPERTY) ?? "",
    );
    const fallback = Math.min(
      32 *
        Number.parseFloat(getComputedStyle(document.documentElement).fontSize),
      viewport * 0.42,
    );
    return {
      min,
      max,
      value: Math.round(
        Math.min(
          max,
          Math.max(min, Number.isFinite(preferred) ? preferred : fallback),
        ),
      ),
    };
  }, [rootRef]);

  const updateWidth = (width: number) => {
    const bounds = measure();
    const value = Math.round(Math.min(bounds.max, Math.max(bounds.min, width)));
    rootRef.current?.style.setProperty(WIDTH_PROPERTY, `${value}px`);
    setSize({ ...bounds, value });
  };

  useEffect(() => {
    const synchronize = () => setSize(measure());
    synchronize();
    window.addEventListener("resize", synchronize);
    return () => window.removeEventListener("resize", synchronize);
  }, [measure]);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      width: measure().value,
    };
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const start = drag.current;
    if (start?.pointerId === event.pointerId)
      updateWidth(start.width + start.x - event.clientX);
  };
  const finishDrag = (event: PointerEvent<HTMLDivElement>) => {
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const bounds = measure();
    const step = event.shiftKey ? 64 : 24;
    let width: number;
    switch (event.key) {
      case "ArrowLeft":
        width = bounds.value + step;
        break;
      case "ArrowRight":
        width = bounds.value - step;
        break;
      case "Home":
        width = bounds.min;
        break;
      case "End":
        width = bounds.max;
        break;
      default:
        return;
    }
    event.preventDefault();
    event.stopPropagation();
    updateWidth(width);
  };
  const onDoubleClick = () => {
    rootRef.current?.style.removeProperty(WIDTH_PROPERTY);
    setSize(measure());
  };

  return {
    ...size,
    onPointerDown,
    onPointerMove,
    onPointerUp: finishDrag,
    onPointerCancel: finishDrag,
    onLostPointerCapture: () => {
      drag.current = null;
    },
    onKeyDown,
    onDoubleClick,
  };
};
