/**
 * @file tests/int/repositorySourceLink.int.spec.ts
 * @version 1.0.2
 * @date 2026-11-09
 * @description Защищает контракт построения проверяемых ссылок на исходники репозитория.
 */
import { describe, expect, it } from "vitest";
import { buildRepositorySourceLink } from "../../services/ai-control-plane/src/repositorySourceLink.mapper";

const endpoint = "/api/realize-ai/chat/project-file";
const sha256 = "a".repeat(64);

describe("buildRepositorySourceLink", () => {
  it("возвращает относительную ссылку без base", () => {
    const link = buildRepositorySourceLink("src/file.ts", 12, sha256);

    expect(link).toBe(
      `${endpoint}?path=src%2Ffile.ts&startLine=12&expectedSha256=${sha256}`,
    );
  });

  it("сохраняет сложный path при round-trip через URLSearchParams", () => {
    const path = "src/space name/雪 #?&=% file.ts";
    const link = buildRepositorySourceLink(path, 1, sha256);
    const parsed = new URL(link, "https://example.invalid");

    expect(parsed.pathname).toBe(endpoint);
    expect(parsed.searchParams.get("path")).toBe(path);
    expect([...parsed.searchParams.keys()]).toEqual([
      "path",
      "startLine",
      "expectedSha256",
    ]);
  });

  it("включает точные startLine и expectedSha256", () => {
    const link = buildRepositorySourceLink("src/file.ts", 37, sha256);
    const parsed = new URL(link, "https://example.invalid");

    expect(parsed.searchParams.get("startLine")).toBe("37");
    expect(parsed.searchParams.get("expectedSha256")).toBe(sha256);
  });

  it.each([
    ["http", "http://example.com", "http://example.com"],
    ["https", "https://example.com:8443/", "https://example.com:8443"],
    ["ipv6", "http://[::1]:3000/", "http://[::1]:3000"],
    ["http-default-port", "http://example.com:80/", "http://example.com"],
    ["https-default-port", "https://example.com:443/", "https://example.com"],
  ])(
    "строит абсолютный URL для %s origin с нормализацией завершающего slash",
    (_name, base, origin) => {
      const link = buildRepositorySourceLink("src/file.ts", 4, sha256, base);
      const parsed = new URL(link);

      expect(parsed.origin).toBe(origin);
      expect(parsed.pathname).toBe(endpoint);
      expect(parsed.searchParams.get("startLine")).toBe("4");
      expect(parsed.searchParams.get("expectedSha256")).toBe(sha256);
    },
  );

  it.each([
    "ftp://example.com",
    "javascript:alert(1)",
    "https://" + ["user", "password"].join(":") + "@example.com",
    "https://example.com/base",
    "https://example.com?query=1",
    "https://example.com#fragment",
  ])("отклоняет недопустимый base %s", (base) => {
    expect(() =>
      buildRepositorySourceLink("src/file.ts", 1, sha256, base),
    ).toThrow("repository_source_origin_invalid");
  });

  it("отклоняет malformed base ошибкой URL parser", () => {
    expect(() =>
      buildRepositorySourceLink("src/file.ts", 1, sha256, "http://["),
    ).toThrow(TypeError);
  });
});
