/**
 * @file packages/engineering-runtime/src/filesystem/creationManifest.service.ts
 * @version 1.3.1
 * @date 2026-10-29
 * @description Сверяет полный bounded manifest filesystem mutations и private staging.
 * @see documentation/architecture/engineering-operations.md
 */
import { z } from "zod";
import { selectManifestTree } from "./selectManifestTree.util.ts";
import {
  engineeringPathSchema,
  engineeringSha256Schema,
  engineeringUuidSchema,
} from "../contracts/engineeringPrimitives.schemas.ts";
import { hashEngineeringValue } from "../contracts/hashEngineeringValue.util.ts";
import { failure } from "../runtime/EngineeringFailure.error.ts";
import type { DescriptorFilesystem } from "./DescriptorFilesystem.adapter.ts";
import type {
  CreationManifest,
  FilesystemIdentity,
  ManifestEntry,
  FilesystemMutationInput,
} from "./EngineeringFilesystem.types.ts";

const identity = z.strictObject({
  kind: z.enum(["file", "directory"]),
  dev: z.string().regex(/^\d+$/),
  ino: z.string().regex(/^\d+$/),
  mode: z.number().int().min(0).max(511),
  size: z
    .number()
    .int()
    .min(0)
    .max(8 * 1024 * 1024)
    .nullable(),
  sha256: engineeringSha256Schema.nullable(),
});
const entry = z.strictObject({
  path: z.union([engineeringPathSchema, z.literal("")]),
  identity: identity.nullable(),
  children: z
    .array(
      z.strictObject({
        name: z.string().max(1024),
        kind: z.enum(["file", "directory", "symlink", "special"]),
        dev: z.string(),
        ino: z.string(),
      }),
    )
    .max(4096)
    .nullable(),
});
const manifestSchema = z.strictObject({
  version: z.literal(1),
  stagingId: engineeringUuidSchema,
  stagingIdentity: identity,
  steps: z
    .array(
      z.strictObject({
        path: engineeringPathSchema,
        kind: z.enum([
          "create_file",
          "create_directory",
          "edit_file",
          "move",
          "remove",
        ]),
        fromPath: engineeringPathSchema.nullable().optional().default(null),
        stagedName: z
          .string()
          .regex(/^\d{1,2}$/)
          .nullable(),
        identity: identity.nullable(),
        sourceIdentity: identity.nullable().optional().default(null),
        contentSha256: engineeringSha256Schema.nullable(),
      }),
    )
    .min(1)
    .max(64),
  trackedPaths: z
    .array(z.union([engineeringPathSchema, z.literal("")]))
    .max(512),
  before: z.array(entry).max(512),
  bindingHash: engineeringSha256Schema,
});

export function parseCreationManifest(value: unknown): CreationManifest {
  const result = manifestSchema.safeParse(value);
  if (!result.success)
    failure("CONFLICT", "Filesystem mutation manifest повреждён.");
  for (const step of result.data.steps) {
    const valid =
      step.kind === "create_file"
        ? step.identity?.kind === "file" &&
          step.sourceIdentity === null &&
          step.stagedName !== null &&
          step.fromPath === null
        : step.kind === "create_directory"
          ? step.identity?.kind === "directory" &&
            step.sourceIdentity === null &&
            step.stagedName !== null &&
            step.fromPath === null
          : step.kind === "edit_file"
            ? step.identity?.kind === "file" &&
              step.sourceIdentity?.kind === "file" &&
              step.stagedName !== null &&
              step.fromPath === null
            : step.kind === "move"
              ? !!step.identity &&
                !!step.sourceIdentity &&
                step.identity.kind === step.sourceIdentity.kind &&
                step.fromPath !== null &&
                step.stagedName === null &&
                hashEngineeringValue(step.identity) ===
                  hashEngineeringValue(step.sourceIdentity)
              : step.identity === null &&
                step.sourceIdentity?.kind === "file" &&
                step.fromPath === null &&
                step.stagedName !== null;
    if (!valid)
      failure("CONFLICT", "Filesystem mutation step имеет неверную форму.");
    if (
      step.contentSha256 !==
      (step.kind === "remove" ? null : (step.identity?.sha256 ?? null))
    )
      failure("CONFLICT", "Filesystem mutation content hash повреждён.");
  }
  return result.data;
}
export function parentPath(path: string) {
  const end = path.lastIndexOf("/");
  return end < 0 ? "" : path.slice(0, end);
}
export function baseName(path: string) {
  return path.slice(path.lastIndexOf("/") + 1);
}
export function ancestorPaths(path: string) {
  const paths = [path];
  while (path) {
    path = parentPath(path);
    paths.push(path);
  }
  return paths;
}
export function readManifest(
  fs: DescriptorFilesystem,
  paths: string[],
): ManifestEntry[] {
  let count = 0,
    bytes = 0;
  return paths.map((path) => {
    const e = fs.entry(path);
    count += e.children?.length ?? 0;
    bytes += e.identity?.size ?? 0;
    if (count > 16384 || bytes > 64 * 1024 * 1024)
      failure("LIMIT_EXCEEDED", "Общий manifest превышает лимит чтения.");
    return e;
  });
}
/** Имена ASCII у новых путей; Unicode existing names сравниваются консервативно через NFKC. */
export function foldedName(name: string) {
  return name.normalize("NFKC").toLowerCase();
}
/** Исключение только для ASCII basename в том же parent; NFKC aliases не являются case-only rename. */
export function isCaseOnlySiblingRename(from: string, to: string) {
  return (
    from !== to &&
    parentPath(from) === parentPath(to) &&
    /^[A-Za-z0-9_./-]+$/.test(from) &&
    /^[A-Za-z0-9_./-]+$/.test(to) &&
    foldedName(from) === foldedName(to)
  );
}
export function assertCreationNamespace(
  before: ManifestEntry[],
  paths: string[],
  moves: readonly Pick<
    FilesystemMutationInput,
    "kind" | "path" | "fromPath"
  >[] = [],
) {
  const entries = new Map(before.map((e) => [e.path, e]));
  const added = new Set<string>();
  for (const path of paths) {
    if (!/^[A-Za-z0-9_./-]+$/.test(path))
      failure(
        "UNSUPPORTED",
        "Этот профиль поддерживает ASCII имена новых путей.",
      );
    const parent = parentPath(path),
      name = baseName(path);
    const from = moves.find(
      (move) => move.kind === "move" && move.path === path,
    )?.fromPath;
    const source =
      from && isCaseOnlySiblingRename(from, path)
        ? entries.get(from)
        : undefined;
    const destination = entries.get(path)?.identity;
    if (
      source?.identity &&
      destination &&
      source.identity.dev === destination.dev &&
      source.identity.ino === destination.ino
    )
      failure(
        "UNSUPPORTED",
        "Filesystem не различает исходное и целевое имена case-only rename.",
      );
    if (entries.get(path)?.identity)
      failure("CONFLICT", "Цель уже существует.");
    if (
      !added.has(parent) &&
      entries.get(parent)?.identity?.kind !== "directory"
    )
      failure(
        "INVALID_INPUT",
        "Отсутствующий родитель должен быть создан предыдущим действием.",
      );
    const siblingNames = [
      ...(entries.get(parent)?.children ?? [])
        // Исключается лишь точный исходный объект; чужие aliases и planned names остаются конфликтами.
        .filter(
          (entry) =>
            !(
              source?.identity &&
              from &&
              entry.name === baseName(from) &&
              entry.kind === source.identity.kind &&
              entry.dev === source.identity.dev &&
              entry.ino === source.identity.ino
            ),
        )
        .map((entry) => entry.name),
      ...Array.from(added)
        .filter((p) => parentPath(p) === parent)
        .map(baseName),
    ];
    if (siblingNames.some((n) => foldedName(n) === foldedName(name)))
      failure(
        "CONFLICT",
        "Имя конфликтует с существующим или запланированным объектом.",
      );
    added.add(path);
  }
}
export function manifestDigest(
  manifest: CreationManifest,
  entries: ManifestEntry[],
  staged: ManifestEntry[],
  bindingHash: string,
  stagingIdentity = manifest.stagingIdentity,
) {
  return hashEngineeringValue({
    bindingHash,
    stagingIdentity,
    entries,
    staged,
  });
}
export function expectedSnapshots(manifest: CreationManifest): string[] {
  const entries = structuredClone(manifest.before);
  const staged: ManifestEntry[] = manifest.steps.flatMap((step) =>
    step.stagedName === null
      ? []
      : [
          {
            path: step.stagedName,
            identity: step.kind === "remove" ? null : step.identity,
            children:
              step.kind === "create_directory" && step.identity ? [] : null,
          },
        ],
  );
  const snapshots = [
    manifestDigest(manifest, entries, staged, manifest.bindingHash),
  ];
  const sameIdentity = (
    left: FilesystemIdentity | null,
    right: FilesystemIdentity | null,
  ) =>
    left !== null &&
    right !== null &&
    hashEngineeringValue(left) === hashEngineeringValue(right);
  const currentChild = (path: string) => {
    const parent = entries.find((entry) => entry.path === parentPath(path));
    if (!parent?.children)
      failure(
        "INVALID_INPUT",
        "Родитель не является каталогом в последовательности плана.",
      );
    return { parent, name: baseName(path) };
  };
  const removeChild = (path: string, expected: FilesystemIdentity) => {
    const { parent, name } = currentChild(path);
    const index = parent.children!.findIndex((child) => child.name === name);
    const child = parent.children![index];
    if (!child || child.dev !== expected.dev || child.ino !== expected.ino)
      failure("CONFLICT", "Исходная identity не совпадает с manifest.");
    parent.children!.splice(index, 1);
  };
  const addChild = (path: string, identityValue: FilesystemIdentity) => {
    const { parent, name } = currentChild(path);
    if (parent.children!.some((child) => child.name === name))
      failure("CONFLICT", "Целевое имя уже присутствует в manifest.");
    parent.children!.push({
      name,
      kind: identityValue.kind,
      dev: identityValue.dev,
      ino: identityValue.ino,
    });
    parent.children!.sort((a, b) =>
      a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
    );
  };
  const replaceChild = (
    path: string,
    before: FilesystemIdentity,
    after: FilesystemIdentity,
  ) => {
    removeChild(path, before);
    addChild(path, after);
  };
  for (const step of manifest.steps) {
    if (step.kind === "move") {
      const source =
        step.fromPath && entries.find((e) => e.path === step.fromPath);
      const destination = entries.find((e) => e.path === step.path);
      if (
        !source ||
        !destination ||
        !step.sourceIdentity ||
        !step.identity ||
        !sameIdentity(source.identity, step.sourceIdentity) ||
        !sameIdentity(step.identity, step.sourceIdentity) ||
        destination.identity !== null
      )
        failure("CONFLICT", "Move identities не совпадают с manifest.");
      const tree = selectManifestTree(entries, step.fromPath!).map((entry) =>
        structuredClone(entry),
      );
      if (step.identity.kind === "file" && tree.length !== 1)
        failure("CONFLICT", "File move не может содержать потомков.");
      if (tree.length > 32 && step.identity.kind === "directory")
        failure(
          "LIMIT_EXCEEDED",
          "Directory move manifest превышает 32 объекта.",
        );
      const treeEntries = new Map(tree.map((entry) => [entry.path, entry]));
      for (const entry of tree) {
        if (!entry.identity)
          failure("CONFLICT", "Tree source отсутствует в manifest.");
        for (const child of entry.children ?? []) {
          const nested = treeEntries.get(entry.path + "/" + child.name);
          if (
            !nested?.identity ||
            nested.identity.dev !== child.dev ||
            nested.identity.ino !== child.ino ||
            nested.identity.kind !== child.kind
          )
            failure(
              "CONFLICT",
              "Tree manifest не содержит полный состав потомков.",
            );
        }
        const fromEntry = entries.find((value) => value.path === entry.path)!;
        const toEntry = entries.find(
          (value) =>
            value.path === step.path + entry.path.slice(step.fromPath!.length),
        );
        if (!toEntry || toEntry.identity !== null)
          failure("CONFLICT", "Tree destination отсутствует или занят.");
        fromEntry.identity = null;
        fromEntry.children = null;
        toEntry.identity = entry.identity;
        toEntry.children = entry.children;
      }
      removeChild(step.fromPath!, step.sourceIdentity);
      addChild(step.path, step.identity);
    } else if (step.kind === "remove") {
      const source = entries.find((e) => e.path === step.path);
      if (
        !source ||
        !step.sourceIdentity ||
        !sameIdentity(source.identity, step.sourceIdentity)
      )
        failure("CONFLICT", "Remove identity не совпадает с manifest.");
      source.identity = null;
      source.children = null;
      removeChild(step.path, step.sourceIdentity);
    } else {
      const destination = entries.find((e) => e.path === step.path);
      if (!destination || !step.identity)
        failure("CONFLICT", "Цель отсутствует в manifest операции.");
      if (step.kind === "edit_file") {
        if (
          !step.sourceIdentity ||
          !sameIdentity(destination.identity, step.sourceIdentity)
        )
          failure("CONFLICT", "Edit не содержит исходную identity.");
        replaceChild(step.path, step.sourceIdentity, step.identity);
      } else addChild(step.path, step.identity);
      destination.identity = step.identity;
      destination.children = step.kind === "create_directory" ? [] : null;
    }
    if (step.stagedName !== null) {
      const stageEntry = staged.find((entry) => entry.path === step.stagedName);
      if (!stageEntry)
        failure("CONFLICT", "Private staging slot отсутствует в manifest.");
      stageEntry.identity =
        step.kind === "edit_file" || step.kind === "remove"
          ? step.sourceIdentity
          : null;
      stageEntry.children = null;
    }
    snapshots.push(
      manifestDigest(manifest, entries, staged, manifest.bindingHash),
    );
  }
  return snapshots;
}
