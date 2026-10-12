// @vitest-environment node
/**
 * @file tests/int/template-runtime-installation.int.spec.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Проверяет production-only trust boundary без ложного подтверждения из dev/source metadata.
 * @see documentation/specifications/extension-management.md
 */
import { afterEach, describe, expect, it, vi } from "vitest";
const binding = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock(
  "../../.ai/tools/agent-search/src/installedSearchBinding.adapter.mjs",
  () => ({
    readCompiledSearchBinding: binding.read,
  }),
);
import { readTemplateRuntimeInstallation } from "../../src/components/admin/system-shell/readTemplateRuntimeInstallation.service";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
describe("template runtime installation host proof", () => {
  it("does not confirm dev even when an old BUILD_ID is present", async () => {
    vi.stubEnv("NODE_ENV", "development");
    binding.read.mockResolvedValue({ installedBuildID: "stale" });
    expect(await readTemplateRuntimeInstallation()).toBeNull();
    expect(binding.read).not.toHaveBeenCalled();
  });
  it("reads the current process directory and returns only the receipt allowlist", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("REALIZE_NEXT_DIST_DIR", "/unrelated/build");
    binding.read.mockResolvedValue({
      schemaVersion: "1.0",
      installedBuildID: "same_process_build",
      sourceVersion: "abc123",
      builtAt: "2026-10-12T10:00:00.000Z",
      privatePath: "/private/example",
    });
    expect(await readTemplateRuntimeInstallation()).toEqual({
      schemaVersion: "1.0",
      buildId: "same_process_build",
      sourceVersion: "abc123",
      builtAt: "2026-10-12T10:00:00.000Z",
    });
    expect(binding.read).toHaveBeenCalledWith(process.cwd(), {
      NODE_ENV: "production",
      REALIZE_NEXT_DIST_DIR: ".next",
    });
  });
  it("leaves an absent or mismatched process receipt unverified", async () => {
    vi.stubEnv("NODE_ENV", "production");
    binding.read.mockResolvedValue(undefined);
    expect(await readTemplateRuntimeInstallation()).toBeNull();
  });
});
