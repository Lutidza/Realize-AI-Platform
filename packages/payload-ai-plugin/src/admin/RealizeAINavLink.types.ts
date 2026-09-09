/**
 * @file packages/payload-ai-plugin/src/admin/RealizeAINavLink.types.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Задаёт настраиваемые ссылки навигации AI и интеграций.
 */

/** Относительные пути дополняются текущим routes.admin из конфигурации Payload. */
export type RealizeAINavLinkProps = {
  group: string;
  integrationsRoute: `/${string}`;
  route: `/${string}`;
};

export type RealizeAINavigationItem = {
  href: string;
  id: string;
  isActive: boolean;
  isCurrentPage: boolean;
  label: string;
};

export type RealizeAINavLinkViewProps = {
  group: string;
  links: RealizeAINavigationItem[];
};
