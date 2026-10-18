/**
 * @file tests/int/standaloneBundle.int.spec.ts
 * @version 1.0.1
 * @date 2026-10-18
 * @description Проверяет переносимую упаковку standalone на изолированных файловых fixture без сборки приложения.
 * @see documentation/delivery/01-local-admin-ai.md
 */

// @vitest-environment node

import { afterEach, describe, expect, it } from "vitest";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readlink,
  readdir,
  realpath,
  rename,
  rm,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, sep } from "node:path";
import { prepareStandaloneBundle } from "../../scripts/runtime/standalone/prepareStandaloneBundle.adapter.mjs";

const roots: string[] = [];
const buildID = "fixture-build-id";
const binding = {
  schemaVersion: "1.0",
  sourceVersion: "a".repeat(64),
  installedBuildID: buildID,
  builtAt: "2026-10-18T00:00:00.000Z",
};
const receipt = `${JSON.stringify(binding)}\n`;
const logo = "<svg>synthetic static logo</svg>\n";

async function put(path: string, content: string) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
}

async function link(target: string, path: string) {
  await mkdir(dirname(path), { recursive: true });
  await symlink(target, path);
}

/** Все sources, raw output и targets принадлежат одной disposable fixture. */
async function fixture(nested = true) {
  const root = await mkdtemp(join(tmpdir(), "realize-standalone-bundle-"));
  roots.push(root);
  const traceRoot = join(root, "source");
  const site = nested ? join(traceRoot, "snapshots/site") : traceRoot;
  const relativeAppDir = relative(traceRoot, site);
  const raw = join(site, ".next/standalone");
  const app = join(raw, relativeAppDir);
  const destination = join(root, "package");
  const metadata = {
    appDir: site,
    relativeAppDir,
    config: { outputFileTracingRoot: traceRoot },
  };
  await put(
    join(site, ".next/required-server-files.json"),
    JSON.stringify(metadata),
  );
  await put(join(app, "server.js"), "// synthetic server, never executed\n");
  await put(join(app, "package.json"), JSON.stringify({ name: "fixture-app" }));
  for (const directory of [join(site, ".next"), join(app, ".next")]) {
    await put(join(directory, "BUILD_ID"), buildID);
    await put(join(directory, "realize-search-build.json"), receipt);
  }
  await put(
    join(site, ".next/static/chunks/app.js"),
    "synthetic static bytes\n",
  );
  await put(join(site, "public/favicon.svg"), "<svg/>\n");
  for (const directory of [site, app]) {
    await put(join(directory, "public/media/logo.svg"), logo);
  }
  await put(
    join(site, "public/media/source.bin"),
    "synthetic media excluded\n",
  );

  const dependency = "fixture-dependency";
  const sourceDependency = join(traceRoot, "node_modules", dependency);
  const mappedDependency = join(raw, "node_modules", dependency);
  for (const directory of [sourceDependency, mappedDependency]) {
    await put(
      join(directory, "package.json"),
      JSON.stringify({ name: dependency, main: "index.js" }),
    );
    await put(join(directory, "index.js"), "module.exports = 7\n");
  }
  await put(join(sourceDependency, "untraced.txt"), "must never be copied\n");
  const externalLink = nested
    ? join(app, "node_modules", dependency)
    : join(app, "aliases/dependency");
  const absoluteLink = join(app, "aliases/server-absolute.js");
  const relativeLink = join(app, "aliases/server-relative.js");
  await link(sourceDependency, externalLink);
  await link(join(app, "server.js"), absoluteLink);
  await link("../server.js", relativeLink);
  return {
    root,
    traceRoot,
    site,
    raw,
    app,
    destination,
    metadata,
    relativeAppDir,
    sourceDependency,
    mappedDependency,
    externalLink,
    absoluteLink,
    relativeLink,
  };
}

async function expectAbsent(path: string) {
  await expect(lstat(path)).rejects.toMatchObject({ code: "ENOENT" });
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("Упаковка standalone без зависимости от source checkout", () => {
  it.each([true, false])(
    "сохраняет layout и работает после переноса при nested=%s",
    async (nested) => {
      const f = await fixture(nested);
      const result = await prepareStandaloneBundle(f.site, f.destination);
      const packagedApp = join(f.destination, f.relativeAppDir);
      expect(result).toMatchObject({
        directory: f.destination,
        appDirectory: packagedApp,
        relativeAppDir: f.relativeAppDir,
        buildID,
      });
      for (const name of [
        "server.js",
        "package.json",
        ".next/BUILD_ID",
        ".next/realize-search-build.json",
        "public/media/logo.svg",
      ]) {
        expect(await readFile(join(packagedApp, name))).toEqual(
          await readFile(join(f.app, name)),
        );
      }
      expect(
        await readFile(join(packagedApp, ".next/static/chunks/app.js"), "utf8"),
      ).toBe("synthetic static bytes\n");
      expect(
        await readFile(join(packagedApp, "public/favicon.svg"), "utf8"),
      ).toBe("<svg/>\n");
      expect(
        await readFile(join(packagedApp, "public/media/logo.svg"), "utf8"),
      ).toBe(logo);
      await expectAbsent(join(packagedApp, "public/media/source.bin"));
      expect(
        await readFile(join(f.site, "public/media/source.bin"), "utf8"),
      ).toBe("synthetic media excluded\n");
      await expectAbsent(
        join(f.destination, "node_modules/fixture-dependency/untraced.txt"),
      );
      expect(await readlink(f.externalLink)).toBe(f.sourceDependency);
      expect(await readlink(f.absoluteLink)).toBe(join(f.app, "server.js"));

      const relocated = join(f.root, "relocated");
      await rename(f.destination, relocated);
      await rename(f.traceRoot, join(f.root, "hidden-source"));
      const relocatedApp = join(relocated, f.relativeAppDir);
      for (const originalLink of [
        f.externalLink,
        f.absoluteLink,
        f.relativeLink,
      ]) {
        const relocatedLink = join(relocated, relative(f.raw, originalLink));
        expect(isAbsolute(await readlink(relocatedLink))).toBe(false);
        expect(
          (await realpath(relocatedLink)).startsWith(relocated + sep),
        ).toBe(true);
      }
      const require = createRequire(join(relocatedApp, "server.js"));
      expect(require.resolve("fixture-dependency")).toBe(
        join(relocated, "node_modules/fixture-dependency/index.js"),
      );
      expect(
        await readFile(
          join(relocatedApp, "aliases/server-relative.js"),
          "utf8",
        ),
      ).toBe("// synthetic server, never executed\n");
    },
  );

  it("сохраняет существующий destination при отказе", async () => {
    const f = await fixture();
    await put(join(f.destination, "existing.txt"), "untouched\n");
    await expect(
      prepareStandaloneBundle(f.site, f.destination),
    ).rejects.toThrow();
    expect(await readdir(f.destination)).toEqual(["existing.txt"]);
    expect(await readFile(join(f.destination, "existing.txt"), "utf8")).toBe(
      "untouched\n",
    );
    expect(await readlink(f.externalLink)).toBe(f.sourceDependency);
  });

  it("отклоняет private ancestor до разбора metadata JSON", async () => {
    const f = await fixture();
    const privateDirectory = join(f.site, ".codex");
    await rename(join(f.site, ".next"), privateDirectory);
    await put(
      join(privateDirectory, "required-server-files.json"),
      "SYNTHETIC NON-JSON PRIVATE METADATA",
    );
    await link(privateDirectory, join(f.site, ".next"));

    await expect(
      prepareStandaloneBundle(f.site, f.destination),
    ).rejects.toThrow(/private\/runtime/);

    await expectAbsent(f.destination);
    expect(await readlink(join(f.site, ".next"))).toBe(privateDirectory);
  });

  it("отклоняет конфликтующие public assets и сохраняет raw", async () => {
    const f = await fixture();
    const rawAsset = join(f.app, "public/favicon.svg");
    await put(rawAsset, "different raw bytes\n");

    await expect(
      prepareStandaloneBundle(f.site, f.destination),
    ).rejects.toThrow();

    await expectAbsent(f.destination);
    expect(await readFile(rawAsset, "utf8")).toBe("different raw bytes\n");
    expect(await readFile(join(f.site, "public/favicon.svg"), "utf8")).toBe(
      "<svg/>\n",
    );
  });

  it.each(["../escape", "/absolute", "other/site"])(
    "отклоняет некорректный relativeAppDir %s",
    async (relativeAppDir) => {
      const f = await fixture();
      await put(
        join(f.site, ".next/required-server-files.json"),
        JSON.stringify({ ...f.metadata, relativeAppDir }),
      );
      await expect(
        prepareStandaloneBundle(f.site, f.destination),
      ).rejects.toThrow();
      await expectAbsent(f.destination);
      expect(await readlink(f.externalLink)).toBe(f.sourceDependency);
    },
  );

  it.each([
    "внешний target",
    "нет traced target",
    "traced target выходит наружу",
    "оборванная ссылка",
    ".env в raw",
    "upload в raw",
    "private symlink",
  ])("отклоняет %s и удаляет только созданную копию", async (scenario) => {
    const f = await fixture();
    const outside = join(f.root, "outside/index.js");
    await put(outside, "outside fixture data\n");
    if (scenario === "внешний target") {
      await unlink(f.externalLink);
      await link(dirname(outside), f.externalLink);
    } else if (scenario === "нет traced target") {
      await rm(f.mappedDependency, { recursive: true });
    } else if (scenario === "traced target выходит наружу") {
      await rm(f.mappedDependency, { recursive: true });
      await link(dirname(outside), f.mappedDependency);
    } else if (scenario === "оборванная ссылка") {
      await link(join(f.traceRoot, "missing"), join(f.app, "aliases/missing"));
    } else if (scenario === ".env в raw") {
      await put(join(f.app, ".env"), "SYNTHETIC_FIXTURE_ONLY=1\n");
    } else if (scenario === "upload в raw") {
      await put(
        join(f.app, "public/media/raw.bin"),
        "synthetic runtime media\n",
      );
    } else {
      const privateTarget = join(f.traceRoot, ".codex/auth.json");
      await put(privateTarget, '{"synthetic":true}\n');
      await link(privateTarget, join(f.app, "aliases/private"));
    }
    const sourceLink = await readlink(f.externalLink);
    await expect(
      prepareStandaloneBundle(f.site, f.destination),
    ).rejects.toThrow();
    await expectAbsent(f.destination);
    expect(await readlink(f.externalLink)).toBe(sourceLink);
    expect(await readFile(join(f.app, "server.js"), "utf8")).toBe(
      "// synthetic server, never executed\n",
    );
    expect(await readFile(outside, "utf8")).toBe("outside fixture data\n");
  });

  it.each([
    ["source", "public/media/logo.svg"],
    ["raw", "public/media/logo.svg"],
    ["source", "public/media"],
    ["raw", "public/media"],
  ])("отклоняет symlink %s/%s и сохраняет его target", async (owner, name) => {
    const f = await fixture();
    const path = join(owner === "source" ? f.site : f.app, name);
    const target = join(f.root, "synthetic-media-target");
    await rename(path, target);
    await link(target, path);

    await expect(
      prepareStandaloneBundle(f.site, f.destination),
    ).rejects.toThrow();

    await expectAbsent(f.destination);
    expect(await readlink(path)).toBe(target);
    expect(
      await readFile(
        name.endsWith("logo.svg") ? target : join(target, "logo.svg"),
        "utf8",
      ),
    ).toBe(logo);
  });

  it.each(["BUILD_ID", "realize-search-build.json"])(
    "отклоняет несовпадающий %s",
    async (name) => {
      const f = await fixture();
      await put(join(f.app, ".next", name), "mismatched fixture bytes\n");
      await expect(
        prepareStandaloneBundle(f.site, f.destination),
      ).rejects.toThrow();
      await expectAbsent(f.destination);
      expect(await readFile(join(f.app, ".next", name), "utf8")).toBe(
        "mismatched fixture bytes\n",
      );
    },
  );

  it("проверяет контракт receipt даже при совпадающих копиях", async () => {
    const f = await fixture();
    const invalid = JSON.stringify({ ...binding, sourceVersion: "invalid" });
    await put(join(f.site, ".next/realize-search-build.json"), invalid);
    await put(join(f.app, ".next/realize-search-build.json"), invalid);
    await expect(
      prepareStandaloneBundle(f.site, f.destination),
    ).rejects.toThrow();
    await expectAbsent(f.destination);
  });
});
