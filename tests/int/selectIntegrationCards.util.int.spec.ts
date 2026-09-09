/**
 * @file tests/int/selectIntegrationCards.util.int.spec.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Проверяет совместную фильтрацию каталога и независимость активности от токена.
 */

import type {
  GitHubIntegrationConnectionDTO,
  IntegrationCatalogDTO,
} from "@realize/ai-contracts";
import { describe, expect, it } from "vitest";
import { selectIntegrationCards } from "../../packages/payload-ai-plugin/src/admin/integrations/catalog/selectIntegrationCards.util";

const connection: GitHubIntegrationConnectionDTO = {
  configuration: {
    repositorySlug: "realize/store",
    repositoryURL: "https://github.com/realize/store",
    transport: "ssh",
    sshProfileRef: "project",
  },
  connectionKey: "github:primary",
  displayName: "GitHub",
  enabled: true,
  hasCredential: false,
  id: "1",
  lastTestStatus: "never",
  provider: "github",
  revision: 1,
  updatedAt: "2026-09-09T00:00:00.000Z",
};
const catalog: IntegrationCatalogDTO = {
  connections: [connection],
  vaultConfigured: false,
  providers: [
    {
      capabilities: ["source"],
      category: "development",
      description: "Репозиторий и автоматизация",
      id: "github",
      name: "GitHub",
    },
  ],
};

describe("selectIntegrationCards", () => {
  it("ищет без учёта регистра и краевых пробелов, включая русское описание", () => {
    expect(selectIntegrationCards(catalog, "  gIThUb  ", "all")).toHaveLength(
      1,
    );
    expect(selectIntegrationCards(catalog, "РЕПОЗИТОРИЙ", "all")).toHaveLength(
      1,
    );
    expect(
      selectIntegrationCards(catalog, "нет такого сервиса", "all"),
    ).toEqual([]);
  });
  it("считает включённый SSH без API credential активным, даже без проверки", () => {
    expect(selectIntegrationCards(catalog, "", "active")[0]?.isActive).toBe(
      true,
    );
    expect(selectIntegrationCards(catalog, "GitHub", "inactive")).toEqual([]);
  });
  it("считает выключенное или отсутствующее подключение неактивным независимо от успешной проверки", () => {
    for (const connections of [
      [],
      [
        {
          ...connection,
          enabled: false,
          hasCredential: true,
          lastTestStatus: "passed" as const,
        },
      ],
    ]) {
      const current = { ...catalog, connections };
      expect(selectIntegrationCards(current, "", "active")).toEqual([]);
      expect(
        selectIntegrationCards(current, "GitHub", "inactive")[0]?.isActive,
      ).toBe(false);
      expect(
        selectIntegrationCards(current, "нет совпадений", "inactive"),
      ).toEqual([]);
    }
  });
  it("обрабатывает пустой реестр без фиктивных карточек", () => {
    expect(
      selectIntegrationCards({ ...catalog, providers: [] }, "", "all"),
    ).toEqual([]);
  });
});
