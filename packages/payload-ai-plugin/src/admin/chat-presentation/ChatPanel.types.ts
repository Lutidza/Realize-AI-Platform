/**
 * @file packages/payload-ai-plugin/src/admin/chat-presentation/ChatPanel.types.ts
 * @version 1.0.0
 * @date 2026-09-10
 * @description Задаёт связь панели с общей оболочкой и начальные координаты её перетаскивания.
 */

import type { RefObject } from "react";

export type ChatHostProps = { rootRef: RefObject<HTMLDivElement | null> };
export type ChatPanelResizeProps = ChatHostProps & { panelId: string };
export type ChatPanelDrag = { pointerId: number; x: number; width: number };
