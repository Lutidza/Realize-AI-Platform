/**
 * @file tests/int/preview-browser-checks.int.spec.ts
 * @version 1.0.1
 * @date 2026-09-20
 * @description Проверяет browser evidence, целевую навигацию и диагностику ошибок Chromium.
 */

import type { Route } from "@playwright/test";
import { beforeEach, describe, expect, it, vi } from "vitest";

const browserMocks = vi.hoisted(() => ({
  launch: vi.fn(),
  close: vi.fn(),
  contextClose: vi.fn(),
  newContext: vi.fn(),
  goto: vi.fn(),
  url: vi.fn(),
  route: vi.fn(),
  overlayCount: vi.fn(),
}));
vi.mock("@playwright/test", () => ({
  chromium: { launch: browserMocks.launch },
}));

import { runPreviewBrowserPreflight } from "../../services/ai-execution-worker/src/previewBrowserPreflight.service";
import { runPreviewBrowserSmoke } from "../../services/ai-execution-worker/src/previewBrowserSmoke";

const origin = "http://127.0.0.1:3200";
const target = `${origin}/reference/realize-ai`;
// Синтетический userinfo создаётся в памяти для проверки запрета credentials.
const credentialedUrl = new URL("http://127.0.0.1:3200/");
credentialedUrl.username = "fixture-user";
credentialedUrl.password = "fixture-password";

const frame = {};
const response = (status: number) => ({
  ok: () => status === 200,
  status: () => status,
});

beforeEach(() => {
  vi.resetAllMocks();
  browserMocks.goto.mockImplementation(async (url: string) => {
    browserMocks.url.mockReturnValue(url);
    return response(200);
  });
  browserMocks.overlayCount.mockResolvedValue(0);
  browserMocks.newContext.mockResolvedValue({
    close: browserMocks.contextClose,
    newPage: async () => ({
      goto: browserMocks.goto,
      url: browserMocks.url,
      route: browserMocks.route,
      mainFrame: () => frame,
      locator: () => ({ count: browserMocks.overlayCount }),
      title: async () => "Realize reference",
    }),
  });
  browserMocks.launch.mockResolvedValue({
    close: browserMocks.close,
    newContext: browserMocks.newContext,
  });
});

describe("preview Chromium checks", () => {
  it("checks health at origin and the reference URL without visiting storefront", async () => {
    const result = await runPreviewBrowserSmoke(target);
    expect(result.status).toBe("passed");
    expect(browserMocks.newContext).toHaveBeenCalledWith({
      baseURL: origin,
      serviceWorkers: "block",
    });
    expect(browserMocks.goto.mock.calls.map(([url]) => url)).toEqual([
      `${origin}/api/health/ready`,
      target,
    ]);
    expect(result.outputSummary).toContain("/reference/realize-ai");
    expect(browserMocks.close).toHaveBeenCalledOnce();
  });

  it("retains root navigation for ordinary changes", async () => {
    expect((await runPreviewBrowserSmoke(origin)).status).toBe("passed");
    expect(browserMocks.goto).toHaveBeenLastCalledWith(`${origin}/`, {
      waitUntil: "networkidle",
    });
  });

  it("reports an unavailable target with its path and HTTP status", async () => {
    browserMocks.goto
      .mockResolvedValueOnce(response(200))
      .mockResolvedValueOnce(response(404));
    browserMocks.url.mockReturnValue(`${origin}/api/health/ready`);
    expect(await runPreviewBrowserSmoke(target)).toMatchObject({
      status: "failed",
      outputSummary: "Preview target /reference/realize-ai returned 404.",
    });
  });

  it("does not open the target after failed readiness", async () => {
    browserMocks.goto.mockResolvedValueOnce(response(503));
    expect((await runPreviewBrowserSmoke(target)).status).toBe("failed");
    expect(browserMocks.goto).toHaveBeenCalledOnce();
  });

  it("rejects a redirect to a different page even when it returns 200", async () => {
    browserMocks.goto.mockImplementation(async (url: string) => {
      browserMocks.url.mockReturnValue(url === target ? `${origin}/` : url);
      return response(200);
    });
    expect(await runPreviewBrowserSmoke(target)).toMatchObject({
      status: "failed",
      outputSummary: "Preview target redirected to another page.",
    });
  });

  it("blocks an unapproved top-level navigation before sending its request", async () => {
    await runPreviewBrowserSmoke(target);
    const handler = browserMocks.route.mock.calls[0][1] as (
      route: Route,
    ) => Promise<void>;
    const abort = vi.fn();
    const continueRequest = vi.fn();
    await handler({
      request: () => ({
        isNavigationRequest: () => true,
        frame: () => frame,
        url: () => "http://example.invalid/",
      }),
      abort,
      continue: continueRequest,
    } as unknown as Route);
    expect(abort).toHaveBeenCalledOnce();
    expect(continueRequest).not.toHaveBeenCalled();
  });

  it("does not follow HTTP redirects when fetching the approved navigation", async () => {
    await runPreviewBrowserSmoke(target);
    const handler = browserMocks.route.mock.calls[0][1] as (
      route: Route,
    ) => Promise<void>;
    const fetchResponse = vi.fn().mockResolvedValue(response(302));
    const abort = vi.fn();
    const fulfill = vi.fn();
    await handler({
      request: () => ({
        isNavigationRequest: () => true,
        frame: () => frame,
        url: () => target,
      }),
      fetch: fetchResponse,
      abort,
      fulfill,
    } as unknown as Route);
    expect(fetchResponse).toHaveBeenCalledWith({ maxRedirects: 0 });
    expect(abort).toHaveBeenCalledOnce();
    expect(fulfill).not.toHaveBeenCalled();
  });

  it.each([
    "https://example.invalid/reference/example",
    "http://127.0.0.1:3200/admin",
    credentialedUrl.href,
    `${target}?url=other`,
    `${target}#other`,
    `${origin}/reference/../`,
    `${origin}/reference/%2e%2e`,
    `${origin}/reference/example\\..\\`,
  ])("rejects unsafe target %s without launching Chromium", async (url) => {
    expect((await runPreviewBrowserSmoke(url)).status).toBe("failed");
    expect(browserMocks.launch).not.toHaveBeenCalled();
  });

  it("records Chromium launch failure as smoke evidence", async () => {
    browserMocks.launch.mockRejectedValueOnce(
      new Error("Executable does not exist"),
    );
    expect(await runPreviewBrowserSmoke(target)).toMatchObject({
      status: "failed",
      outputSummary: "Executable does not exist",
      evidenceHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
  });

  it.each(["contextClose", "close"] as const)(
    "fails smoke when %s fails",
    async (method) => {
      browserMocks[method].mockRejectedValueOnce(
        new Error("Browser shutdown failed"),
      );
      expect(await runPreviewBrowserSmoke(target)).toMatchObject({
        status: "failed",
        outputSummary: "Browser shutdown failed",
      });
    },
  );

  it("preflight launches and closes Chromium without navigation", async () => {
    expect((await runPreviewBrowserPreflight()).status).toBe("passed");
    expect(browserMocks.close).toHaveBeenCalledOnce();
    expect(browserMocks.newContext).not.toHaveBeenCalled();
  });

  it("records missing Chromium as preflight evidence", async () => {
    browserMocks.launch.mockRejectedValueOnce(
      new Error("Executable does not exist"),
    );
    expect(await runPreviewBrowserPreflight()).toMatchObject({
      command: "playwright preview preflight",
      status: "failed",
      outputSummary: "Executable does not exist",
    });
  });
});
