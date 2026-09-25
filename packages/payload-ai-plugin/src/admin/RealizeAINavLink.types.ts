/**
 * @file packages/payload-ai-plugin/src/admin/RealizeAINavLink.types.ts
 * @version 1.3.0
 * @date 2026-09-20
 * @description Задаёт настраиваемые ссылки навигации AI и интеграций.
 */

/** Относительные пути дополняются текущим routes.admin из конфигурации Payload. */
export type RealizeAINavLinkProps = {
  group: string;
  integrationsRoute: `/${string}`;
  mcpServersRoute: `/${string}`;
  route: `/${string}`;
};

export type RealizeAINavigationItem = {
  href: string;
  id: string;
  isActive: boolean;
  isCurrentPage: boolean;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
};

export type RealizeAINavigationGroup = {
  label: string;
  links: RealizeAINavigationItem[];
};

export type RealizeAINavLinkViewProps = {
  groups: RealizeAINavigationGroup[];
};
