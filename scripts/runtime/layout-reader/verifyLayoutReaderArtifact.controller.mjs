/**
 * @file scripts/runtime/layout-reader/verifyLayoutReaderArtifact.controller.mjs
 * @version 1.0.0
 * @date 2026-11-21
 * @description Запускает offline acceptance точного server/client artifact и печатает проверяемый JSON receipt.
 * @see documentation/reports/2026-11-21-layout-reader-delivery-rollback-audit.md
 */
import { lstat, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  readLayoutReaderArtifact,
  sha256,
} from "./readLayoutReaderArtifact.adapter.mjs";
import {
  createWebpackArtifactLoader,
  selectServerEntryFiles,
  selectClientManifestFiles,
  findCompiledWriterPolicyCallsites,
  artifactProbeToolVersions,
} from "./webpackArtifactLoader.adapter.mjs";
import { collectLayoutReaderExports } from "./discoverLayoutReaders.service.mjs";
import { runLayoutReaderMatrix } from "./runLayoutReaderMatrix.service.mjs";

const args = process.argv.slice(2);
let artifactPath;
let fixturesPath;
let discoverOnly = false;
let serverEntry = ".next/server/app/(payload)/api/[...slug]/route.js";
let clientManifest =
  ".next/server/app/(system-admin)/system/appearance/page_client-reference-manifest.js";
for (let index = 0; index < args.length; index += 1) {
  if (args[index] === "--artifact") artifactPath = args[++index];
  else if (args[index] === "--fixtures") fixturesPath = args[++index];
  else if (args[index] === "--discover-only") discoverOnly = true;
  else if (args[index] === "--server-entry") serverEntry = args[++index];
  else if (args[index] === "--client-manifest") clientManifest = args[++index];
  else
    throw new Error(
      "Usage: --artifact <canonical-app-directory> [--fixtures <json>] [--discover-only]",
    );
}
if (!artifactPath || !fixturesPath)
  throw new Error(
    "--artifact and --fixtures are required; neither checkout build nor fixture input is inferred.",
  );

const report = {
  schemaVersion: "1.0",
  kind: "layout-reader-artifact-acceptance",
  status: "failed",
  executionPolicy: {
    nativeImports: "crypto-only",
    fileStartup: false,
    repositories: false,
    network: false,
    writes: false,
    jsonFixturesOnly: true,
  },
  fixtureOnly: true,
  matrices: [],
  probeTools: artifactProbeToolVersions,
  limitations: [
    "JSON fixtures only; structuredClone shim is equivalent only for JSON values",
    "server catalog DTO mapper was optimized into service snapshot and was not executed independently",
    "client compiled decoders were executed offline; hydration/UI were not exercised",
    "durable service callsites are statically bound to disabled; services/repositories/DB were not executed",
  ],
};
try {
  const stat = await lstat(resolve(fixturesPath));
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 8 * 1024 * 1024)
    throw new Error("Fixtures must be a bounded regular JSON file.");
  const fixtureBytes = await readFile(resolve(fixturesPath));
  const fixture = JSON.parse(fixtureBytes.toString("utf8"));
  if (
    fixture.kind !== "layout-reader-artifact-fixtures" ||
    fixture.schemaVersion !== "1.0" ||
    fixture.fixtureOnly !== true
  )
    throw new Error("Unexpected fixture contract.");
  const artifact = await readLayoutReaderArtifact(artifactPath);
  Object.assign(report, {
    artifact: {
      root: artifact.root,
      buildId: artifact.buildId,
      chunkSetHash: artifact.chunkSetHash,
      files: artifact.files.length,
      bytes: artifact.bytes,
      clientBootstrap: artifact.clientBootstrap,
    },
    fixtureHash: sha256(fixtureBytes),
  });
  for (const side of ["server", "client"]) {
    // App entries повторяют external factories с отличающимся minification scope.
    // API entry + shared chunks образуют один проверяемый registry вместо смешивания route runtimes.
    let selectedFiles =
      side === "server"
        ? selectServerEntryFiles(artifact.files, serverEntry)
        : selectClientManifestFiles(artifact.files, clientManifest);
    if (side === "client") {
      const initial = artifact.clientBootstrap.rootMainFiles.map((path) => {
        const matches = artifact.files.filter(
          (file) => file.side === "client" && file.path === `.next/${path}`,
        );
        if (matches.length !== 1)
          throw new Error("Initial client chunk is absent or ambiguous.");
        return matches[0];
      });
      selectedFiles = [
        ...new Map(
          [...selectedFiles, ...initial].map((file) => [file.path, file]),
        ).values(),
      ];
    }
    const loader = createWebpackArtifactLoader(selectedFiles, side);
    try {
      if (discoverOnly) {
        const candidates = collectLayoutReaderExports(loader);
        report.matrices.push({
          side,
          discoveredExports: candidates.values.map(
            ({ key, type, factory, source }) => ({
              key,
              type,
              path: factory.path,
              factoryHash: factory.hash,
              functionSignature: source.slice(0, 240),
            }),
          ),
          discoveryFailures: candidates.failures,
          loader: loader.evidence(),
        });
      } else
        report.matrices.push({
          ...runLayoutReaderMatrix(loader, fixture),
          loader: loader.evidence(),
        });
    } catch (error) {
      report.matrices.push({
        side,
        error: error.message,
        loader: loader.evidence(),
      });
      throw error;
    }
  }
  if (!discoverOnly)
    report.durableServiceDisabledLiterals = {
      kind: "static-compiled-callsite-binding-only",
      matches: findCompiledWriterPolicyCallsites(
        selectServerEntryFiles(artifact.files, serverEntry),
        report.matrices.find((matrix) => matrix.side === "server").readers,
      ),
    };
  report.status = discoverOnly ? "discovery-only" : "passed";
} catch (error) {
  report.error = error.message;
  process.exitCode = 1;
}
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
