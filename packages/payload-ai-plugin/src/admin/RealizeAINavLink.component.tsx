/**
 * @file packages/payload-ai-plugin/src/admin/RealizeAINavLink.component.tsx
 * @version 1.0.0
 * @date 2026-09-09
 * @description Связывает доступ и маршруты с навигацией AI и интеграций.
 */

"use client";

import type { RealizeAINavLinkProps } from "./RealizeAINavLink.types";
import { RealizeAINavLinkView } from "./RealizeAINavLink.view";
import { useRealizeAINavigation } from "./useRealizeAINavigation.hook";

/** Выделяет раздел на дочерней странице и сохраняет ссылку возврата в каталог. */
export const RealizeAINavLink = (props: RealizeAINavLinkProps) => {
  const links = useRealizeAINavigation(props);
  return <RealizeAINavLinkView group={props.group} links={links} />;
};
