/**
 * @file tests/int/release-preview-runtime.int.spec.ts
 * @version 2026-08-27
 * @docref ADR-0011
 * @see documentation/architecture/decisions/ADR-0011-github-ghcr-vps-release-preview.md
 * @description Выполняет VPS preview lifecycle с fake Docker/network commands и реальным scoped filesystem.
 */

import { execFile } from "node:child_process";
import {
  access,
  chmod,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

const run = promisify(execFile);
const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((path) => rm(path, { force: true, recursive: true })),
  );
});

const executable = async (path: string, source: string) => {
  await writeFile(path, `#!/bin/sh\n${source}\n`);
  await chmod(path, 0o700);
};

describe("remote release preview runtime", () => {
  it("keeps the app on an internal backend and production authority absent", async () => {
    const [compose, prepareWorkflow, cleanupWorkflow, ciWorkflow] =
      await Promise.all([
        readFile("compose.release-preview.yaml", "utf8"),
        readFile(".github/workflows/prepare-release-candidate.yml", "utf8"),
        readFile(".github/workflows/cleanup-release-previews.yml", "utf8"),
        readFile(".github/workflows/ci.yml", "utf8"),
      ]);

    expect(compose).toContain("frontend:\n  backend:\n    internal: true");
    expect(compose).toMatch(
      /proxy:[\s\S]*networks:\n      - frontend\n      - backend/,
    );
    expect(compose).toMatch(/web:[\s\S]*networks:\n      - backend/);
    expect(prepareWorkflow).toContain("environment: release-preview");
    expect(prepareWorkflow).not.toMatch(/environment:\s+production/);
    expect(prepareWorkflow).not.toContain("deploy-production");
    expect(ciWorkflow).toContain(
      "ref: ${{ inputs.checkout_ref || github.sha }}",
    );

    for (const workflow of [prepareWorkflow, cleanupWorkflow]) {
      const externalActions = Array.from(
        workflow.matchAll(/^\s*uses:\s+([^\s#]+)/gm),
        (match) => match[1],
      ).filter((reference) => !reference.startsWith("./"));
      expect(externalActions.length).toBeGreaterThan(0);
      expect(
        externalActions.every((reference) => /@[a-f0-9]{40}$/.test(reference)),
      ).toBe(true);
    }
  });

  it("creates one isolated candidate and removes it after expiry", async () => {
    const temporaryParent = await mkdtemp(
      resolve(tmpdir(), "release-preview-parent-"),
    );
    temporaryRoots.push(temporaryParent);
    const root = resolve(temporaryParent, "realize-release-previews");
    await mkdir(root);
    const fakeBin = resolve(root, "fake-bin");
    const runtime = resolve(root, "runtime");
    const shared = resolve(root, "shared");
    await Promise.all([
      mkdir(fakeBin, { recursive: true }),
      mkdir(resolve(shared, "auth"), { recursive: true }),
      mkdir(resolve(shared, "database"), { recursive: true }),
      mkdir(resolve(shared, "media"), { recursive: true }),
      mkdir(resolve(shared, "tls"), { recursive: true }),
      mkdir(runtime, { recursive: true }),
    ]);
    await Promise.all([
      executable(resolve(fakeBin, "curl"), "exit 0"),
      executable(resolve(fakeBin, "docker"), "exit 0"),
      executable(resolve(fakeBin, "ss"), "exit 0"),
      cp(
        "compose.release-preview.yaml",
        resolve(runtime, "compose.release-preview.yaml"),
      ),
      cp(
        "scripts/deploy/release-preview-nginx.conf",
        resolve(runtime, "release-preview-nginx.conf"),
      ),
      writeFile(
        resolve(shared, ".env"),
        "PAYLOAD_SECRET=test\nPREVIEW_SECRET=test\n",
      ),
      writeFile(resolve(shared, "auth/.htpasswd"), "preview:test\n"),
      writeFile(resolve(shared, "database/sanitized.dump"), "sanitized"),
      writeFile(resolve(shared, "tls/fullchain.pem"), "certificate"),
      writeFile(resolve(shared, "tls/privkey.pem"), "private-key"),
    ]);
    const candidateKey = "1".repeat(64);
    const gitCommit = "a".repeat(40);
    const imageDigest = `sha256:${"b".repeat(64)}`;
    const environment = {
      ...process.env,
      CANDIDATE_KEY: candidateKey,
      EXPIRES_AT: new Date(Date.now() + 60_000).toISOString(),
      GIT_COMMIT: gitCommit,
      PATH: `${fakeBin}:${process.env.PATH}`,
      PREVIEW_BASE_DOMAIN: "preview.example.test",
      PREVIEW_DEPLOY_ROOT: root,
      PREVIEW_PORT_MAX: "24443",
      PREVIEW_PORT_MIN: "24443",
      REALIZE_IMAGE: `ghcr.io/realize/app@${imageDigest}`,
    };

    const deployed = await run(
      "bash",
      ["scripts/deploy/remote-release-preview.sh", "deploy"],
      { cwd: process.cwd(), env: environment },
    );
    expect(JSON.parse(deployed.stdout)).toMatchObject({
      candidateKey,
      gitCommit,
      previewStatus: "healthy",
      previewURL: `https://${candidateKey.slice(0, 16)}.preview.example.test:24443`,
    });

    const candidateRoot = resolve(root, "candidates", candidateKey);
    await access(resolve(candidateRoot, "candidate.env"));
    await writeFile(
      resolve(candidateRoot, "expires-at"),
      "2000-01-01T00:00:00.000Z\n",
    );
    const cleaned = await run(
      "bash",
      ["scripts/deploy/remote-release-preview.sh", "cleanup"],
      { cwd: process.cwd(), env: environment },
    );
    expect(JSON.parse(cleaned.stdout)).toEqual({
      cleaned: 1,
      schemaVersion: 1,
    });
    await expect(access(candidateRoot)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
});
