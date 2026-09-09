/**
 * @file tests/int/IntegrationsView.view.int.spec.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Проверяет передачу серверного контекста и хлебных крошек страниц интеграций в Payload.
 */

import { DefaultTemplate } from "@payloadcms/next/templates";
import { SetStepNav } from "@payloadcms/ui";
import { Children, isValidElement, type ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";

import type { IntegrationsViewProps } from "../../packages/payload-ai-plugin/src/admin/integrations/IntegrationsView.types";
import { IntegrationsView } from "../../packages/payload-ai-plugin/src/admin/integrations/IntegrationsView.view";
import { loadIntegrationsView } from "../../packages/payload-ai-plugin/src/admin/integrations/loadIntegrationsView.service";
import { INTEGRATION_PROVIDER_CATALOG } from "../../packages/payload-ai-plugin/src/integrations/providers";

vi.mock("@payloadcms/next/templates", () => ({ DefaultTemplate: vi.fn() }));
vi.mock("@payloadcms/ui", () => ({ SetStepNav: vi.fn() }));
vi.mock(
  "../../packages/payload-ai-plugin/src/admin/integrations/IntegrationsClient.component",
  () => ({ IntegrationsClient: vi.fn() }),
);
vi.mock(
  "../../packages/payload-ai-plugin/src/admin/integrations/loadIntegrationsView.service",
  () => ({ loadIntegrationsView: vi.fn() }),
);

describe("навигация Admin view интеграций", () => {
  it.each(["catalog", "settings"] as const)(
    "передаёт штатным владельцам Payload контекст и крошки режима %s",
    async (mode) => {
      // Root Payload передаёт права, locale и запрос только в initPageResult.
      const props = {
        initPageResult: {
          locale: { code: "ru", label: "Русский" },
          permissions: { canAccessAdmin: true, collections: {}, globals: {} },
          req: { i18n: { language: "ru" }, user: { id: 42 } },
          visibleEntities: Object.freeze({
            collections: ["products"],
            globals: ["header"],
          }),
        },
        integrationsRoute: "/tools/connections",
        mode,
        payload: { config: { routes: { admin: "/control" } } },
      } as unknown as IntegrationsViewProps;
      const catalogURL = "/control/tools/connections";
      vi.mocked(loadIntegrationsView).mockResolvedValue({
        catalogURL,
        initialCatalog: {
          connections: [],
          providers: INTEGRATION_PROVIDER_CATALOG,
          vaultConfigured: false,
        },
        providerID: mode === "settings" ? "github" : undefined,
      });

      const view = await IntegrationsView(props);
      const { locale, permissions, req, visibleEntities } =
        props.initPageResult;

      expect(view.type).toBe(DefaultTemplate);
      expect(view.props.req).toBe(req);
      expect(view.props.permissions).toBe(permissions);
      expect(view.props.i18n).toBe(req.i18n);
      expect(view.props.locale).toBe(locale);
      expect(view.props.user).toBe(req.user);
      expect(view.props.payload).toBe(props.payload);
      expect(view.props.visibleEntities).toEqual(visibleEntities);
      expect(view.props.visibleEntities).not.toBe(visibleEntities);

      const stepNav = Children.toArray(view.props.children).find(
        (child) => isValidElement(child) && child.type === SetStepNav,
      );
      expect(isValidElement(stepNav)).toBe(true);
      if (!isValidElement<ComponentProps<typeof SetStepNav>>(stepNav)) {
        throw new Error(
          "В представлении отсутствует штатный SetStepNav Payload",
        );
      }
      expect(stepNav.props.nav).toEqual([
        { label: "Интеграции", url: catalogURL },
        ...(mode === "settings" ? [{ label: "GitHub" }] : []),
      ]);
    },
  );
});
