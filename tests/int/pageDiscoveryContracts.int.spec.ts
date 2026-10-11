/**
 * @file tests/int/pageDiscoveryContracts.int.spec.ts
 * @version 1.1.0
 * @date 2026-10-04
 * @description Проверяет строгие границы запросов страниц и недоступность private grant модели и браузеру.
 */
import { SYSTEM_AI_RELEASE_REFERENCE } from "@realize/change-engine";
// @vitest-environment node

import { describe, expect, it } from "vitest";
import {
  parseCreateMessageInput,
  parsePageDiscoveryCall,
  parsePageDiscoveryGrant,
  parsePageDiscoverySearch,
} from "@realize/ai-contracts";
import { parseChatRun } from "../../services/ai-control-plane/src/parseChatRun.validator";
import { buildConfiguredChatTurn } from "../../services/ai-control-plane/src/buildConfiguredChatTurn.service";

const grant = {
  endpoint: "http://localhost:3000/api/realize-ai/chat/page-tools/run-1",
  token: "private-credential-" + "x".repeat(40),
};
const catalog = {
  pages: [
    {
      id: "17",
      title: "Доставка",
      slug: "delivery",
      adminUrl: "/admin/collections/pages/17",
    },
  ],
  page: 1,
  totalPages: 1,
  totalDocs: 1,
};

describe("page discovery data boundaries", () => {
  it("accepts model-provided literal search terms without interpreting the user prompt", () => {
    for (const query of ["достав", "delivery", "о компании"]) {
      expect(
        parsePageDiscoveryCall({
          callID: "call-1",
          name: "pages_search",
          arguments: { query },
        }),
      ).toMatchObject({ arguments: { query } });
    }
  });
  it.each([
    { name: "pages_search", arguments: { query: " " } },
    {
      name: "pages_search",
      arguments: { query: "достав", where: { _status: "published" } },
    },
    { name: "pages_search", arguments: { query: "достав", page: 0 } },
    { name: "pages_search", arguments: { query: "достав", page: 1.5 } },
    { name: "pages_read", arguments: { pageID: "17", userID: "1" } },
    { name: "pages_read", arguments: { pageID: "../users" } },
    { name: "pages_structure", arguments: { pageID: "17", offset: 32 } },
    { name: "pages_structure", arguments: { pageID: "17", offset: 1 } },
    { name: "pages_update", arguments: { pageID: "17" } },
  ])("rejects unsafe or unbounded tool arguments: $name", (call) => {
    expect(() =>
      parsePageDiscoveryCall({ callID: "call-1", ...call }),
    ).toThrow();
  });
  it("requires exact revision and catalog hashes for bounded structure continuation", () => {
    const call = {
      callID: "next",
      name: "pages_structure",
      arguments: {
        pageID: "17",
        offset: 32,
        fingerprint: "a".repeat(64),
        catalogHash: "b".repeat(64),
      },
    };
    expect(parsePageDiscoveryCall(call)).toEqual(call);
  });
  it("returns actual page references and rejects raw fields or unsafe editor links", () => {
    expect(parsePageDiscoverySearch(catalog)).toEqual(catalog);
    for (const page of [
      {
        ...catalog.pages[0],
        adminUrl: "https://example.com/admin/collections/pages/17",
      },
      { ...catalog.pages[0], adminUrl: "/admin/collections/pages/18" },
      { ...catalog.pages[0], layout: [] },
    ])
      expect(() =>
        parsePageDiscoverySearch({ ...catalog, pages: [page] }),
      ).toThrow();
    expect(() =>
      parsePageDiscoverySearch({
        ...catalog,
        pages: Array(21).fill(catalog.pages[0]),
      }),
    ).toThrow();
  });
  it("binds private transport metadata to the run and keeps it out of public chat input", () => {
    expect(parsePageDiscoveryGrant(grant, "run-1")).toEqual(grant);
    expect(() => parsePageDiscoveryGrant(grant, "run-2")).toThrow();
    for (const endpoint of [
      "file:///etc/passwd",
      grant.endpoint + "?token=x",
      grant.endpoint.replace("localhost", "user:secret@localhost"),
    ])
      expect(() =>
        parsePageDiscoveryGrant({ ...grant, endpoint }, "run-1"),
      ).toThrow();
    expect(() =>
      parseCreateMessageInput({
        content: "Найди доставку",
        pageDiscovery: grant,
      }),
    ).toThrow();
  });
  it("allows private dispatch but never interpolates the credential or endpoint into model instructions", () => {
    const run = parseChatRun({
      systemRelease: SYSTEM_AI_RELEASE_REFERENCE,
      runID: "run-1",
      prompt: "Найди страницу доставки",
      pageDiscovery: grant,
    });
    const turn = buildConfiguredChatTurn({
      run,
      fileCount: 0,
      totalBytes: 0,
      selectedFiles: [],
      attachmentInstructions: "",
    });
    expect(turn.developerInstructions).toContain("pages_search");
    expect(turn.developerInstructions).toContain("pages_read");
    expect(turn.developerInstructions).toContain("clarify before editing");
    expect(JSON.stringify(turn)).not.toContain(grant.token);
    expect(JSON.stringify(turn)).not.toContain(grant.endpoint);
    expect(turn.developerInstructions).not.toContain("No CMS page is selected");
  });
});
