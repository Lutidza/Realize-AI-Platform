/**
 * @file src/components/admin/system-shell/filterSystemAdminNavigation.util.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Убирает переходы к отключённым native возможностям из host navigation.
 * @see documentation/architecture/system-admin-shell.md
 */
import type {
  TemplateNavigationItem,
  TemplateNavigationLink,
} from "@realize/template-contracts/react";

/** Видимость не даёт права доступа; native proxy и server ACL проверяют переход повторно. */
export function filterSystemAdminNavigation(
  items: TemplateNavigationItem[],
  nativeEnabled: boolean,
): TemplateNavigationItem[] {
  if (nativeEnabled) return items;
  const native = (href?: string) =>
    href === "/admin" || href?.startsWith("/admin/");
  const link = (item: TemplateNavigationLink): TemplateNavigationLink => ({
    ...item,
    ...(native(item.href)
      ? {
          href: undefined,
          onSelect: undefined,
          disabled: true,
          statusLabel: "Недоступно в этой установке",
        }
      : {}),
    ...(item.shortcuts ? { shortcuts: item.shortcuts.map(link) } : {}),
  });
  return items.map((item) => ({
    ...item,
    ...(native(item.href) ? { href: undefined, onSelect: undefined } : {}),
    ...(item.groups
      ? {
          groups: item.groups.map((group) => ({
            ...group,
            items: group.items.map(link),
          })),
        }
      : {}),
    ...(item.favoriteLinks
      ? { favoriteLinks: item.favoriteLinks.map(link) }
      : {}),
    ...(item.footerAction && native(item.footerAction.href)
      ? { footerAction: undefined }
      : {}),
  }));
}
