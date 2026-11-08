/**
 * @file packages/engineering-runtime/src/filesystem/createLocalFilesystemPorts.service.ts
 * @version 1.6.0
 * @date 2026-10-30
 * @description Планирует trusted authored file mutations с exact identity и private quarantine.
 * @see documentation/architecture/engineering-operations.md
 */
import {
  hashEngineeringValue,
  sha256Bytes,
} from "../contracts/hashEngineeringValue.util.ts";
import type {
  JsonValue,
  PlanCommand,
} from "../contracts/EngineeringCommand.types.ts";
import type {
  FrozenPlan,
  PlanningPort,
  PreparedPlan,
  SynchronousEffectPort,
} from "../runtime/EngineeringRuntime.types.ts";
import type {
  PlannedEffect,
  VersionRef,
} from "../runtime/EngineeringResult.types.ts";
import type {
  ArtifactDescriptorPort,
  ArtifactInventoryPort,
  ResolvedArtifactDescriptor,
  ResolvedFolderDescriptor,
  ResolvedArtifactMove,
} from "../artifacts/ArtifactDescriptor.types.ts";
import {
  EngineeringFailure,
  failure,
} from "../runtime/EngineeringFailure.error.ts";
import { canonicalEngineeringJson } from "../contracts/canonicalEngineeringJson.util.ts";
import { ImmutableContentRepository } from "../content/ImmutableContent.repository.ts";
import { DescriptorFilesystem } from "./DescriptorFilesystem.adapter.ts";
import { PrivateFilesystem } from "./PrivateFilesystem.adapter.ts";
import { CreationStaging } from "./CreationStaging.repository.ts";
import {
  ancestorPaths,
  assertCreationNamespace,
  expectedSnapshots,
  manifestDigest,
  parseCreationManifest,
  readManifest,
} from "./creationManifest.service.ts";
import type {
  CreationManifest,
  LocalFilesystemOptions,
  FilesystemMutationInput,
  ManifestEntry,
} from "./EngineeringFilesystem.types.ts";
import { readFilesystemInventory } from "./readFilesystemInventory.service.ts";
import { readFilesystemNamespace } from "./readFilesystemNamespace.service.ts";
import { buildFilesystemDiff } from "./buildFilesystemDiff.util.ts";
import { readFilesystemTree } from "./readFilesystemTree.service.ts";
import { prepareDirectoryFilesystemMove } from "./prepareDirectoryFilesystemMove.service.ts";

/** Trusted host загружает native adapter заранее. Здесь нет compiler, subprocess или выбора произвольного root из команды. */
export function createLocalFilesystemPorts(options: LocalFilesystemOptions) {
  const checkout = new DescriptorFilesystem(
    options.store.binding.canonicalRoot,
    options.native,
  );
  let storage: PrivateFilesystem | undefined,
    content: ImmutableContentRepository | undefined;
  try {
    if (
      checkout.rootIdentity.dev !== options.store.binding.rootIdentity.dev ||
      checkout.rootIdentity.ino !== options.store.binding.rootIdentity.ino
    )
      failure("CONFLICT", "Checkout не совпадает с journal binding.");
    storage = new PrivateFilesystem(
      options.filesDirectory,
      checkout.root,
      options.native,
    );
    content = new ImmutableContentRepository(
      storage,
      options.store.binding.targetId,
      options.now,
    );
    const references = new Map<string, string | null>();
    const descriptors = options.descriptors((path) => {
      assertReadAccess(options, path);
      if (references.size >= 512 && !references.has(path))
        failure("LIMIT_EXCEEDED", "Слишком много источников binding.");
      const record = (hash: string | null) => {
        if (references.has(path) && references.get(path) !== hash)
          failure(
            "CONFLICT",
            "Источник binding изменился; требуется обновление binding.",
          );
        references.set(path, hash);
      };
      try {
        const bytes = checkout.read(path);
        record(sha256Bytes(bytes));
        return bytes;
      } catch (error) {
        // Отрицательный probe тоже версия: новый nearer config не может попасть в старый план.
        if ((error as NodeJS.ErrnoException).code === "ENOENT") record(null);
        throw error;
      }
    });
    const engine = new LocalFilesystemMutationPlanner(
      options,
      checkout,
      new CreationStaging(storage, checkout),
      content,
      descriptors,
      references,
    );
    return {
      planner: engine as PlanningPort,
      effects: engine as SynchronousEffectPort,
      content,
      /** Trusted read port; не выдаёт ACL и не раскрывает private identity. */
      directoryVersion(path: string) {
        return readFilesystemTree(checkout, path).version;
      },
      close() {
        content!.close();
        storage!.close();
        checkout.close();
      },
    };
  } catch (error) {
    content?.close();
    storage?.close();
    checkout.close();
    throw error;
  }
}

class LocalFilesystemMutationPlanner
  implements PlanningPort, SynchronousEffectPort
{
  readonly mode = "in_process_sync" as const;
  constructor(
    private readonly options: LocalFilesystemOptions,
    private readonly checkout: DescriptorFilesystem,
    private readonly staging: CreationStaging,
    private readonly content: ImmutableContentRepository,
    private readonly descriptors: ArtifactDescriptorPort,
    private readonly references: Map<string, string | null>,
  ) {}
  prepare(command: PlanCommand): PreparedPlan {
    try {
      return this.prepareFilesystemMutation(command);
    } catch (error) {
      if (error instanceof EngineeringFailure) throw error;
      const code =
        error && typeof error === "object" && "code" in error
          ? error.code
          : null;
      if (
        code === "UNSUPPORTED" ||
        code === "CONFLICT" ||
        code === "LIMIT_EXCEEDED"
      )
        return failure(
          code,
          "Filesystem или native binding не допускает подготовку.",
          "planning",
        );
      if (error instanceof RangeError)
        return failure(
          "LIMIT_EXCEEDED",
          "План превышает допустимый размер.",
          "planning",
        );
      throw error;
    }
  }
  private prepareFilesystemMutation(command: PlanCommand): PreparedPlan {
    if (command.targetId !== this.options.store.binding.targetId)
      failure("FORBIDDEN", "Target не совпадает с binding.");
    if (command.intent.kind !== "file_batch")
      failure(
        "UNSUPPORTED",
        "Этот binding поддерживает только authored file mutations и создание каталогов.",
      );
    const actions = command.intent.actions;
    if (
      actions.some((action) => action.kind === "edit_file") &&
      typeof this.options.native.renameExchange !== "function"
    )
      failure(
        "UNSUPPORTED",
        "Native binding не предоставляет atomic edit; требуется явная пересборка.",
      );
    const files = actions.flatMap((action) =>
      action.kind === "create_file" ||
      action.kind === "edit_file" ||
      action.kind === "move"
        ? [action.kind === "move" ? action.to : action.path]
        : [],
    );
    const actionPaths = actions.flatMap((action) =>
      action.kind === "move" ? [action.from, action.to] : [action.path],
    );
    if (new Set(actionPaths).size !== actionPaths.length)
      failure("CONFLICT", "Один batch не может повторять путь.");
    if (
      this.descriptors.prepareMove &&
      actions.filter((action) => action.kind === "move").length > 1
    )
      failure("UNSUPPORTED", "В batch допускается один project move.");
    const reservedPaths = new Set(actionPaths);
    const observedNamespaces = new Map<string, ManifestEntry>();
    const tracked = new Set<string>();
    const refs: VersionRef[] = [];
    const effects: PlannedEffect[] = [];
    const checks = new Set<string>();
    const inputs: FilesystemMutationInput[] = [];
    const track = (path: string) => {
      for (const ancestor of ancestorPaths(path)) tracked.add(ancestor);
    };
    const readNamespace = (path: string) => {
      assertReadAccess(this.options, path);
      return readFilesystemNamespace(this.checkout, path, observedNamespaces);
    };
    const inventory: ArtifactInventoryPort = {
      files: (roots) => readFilesystemInventory(readNamespace, roots),
      directories: (path, maximumEntries) => {
        if (
          !Number.isInteger(maximumEntries) ||
          maximumEntries < 1 ||
          maximumEntries > 4096
        )
          failure("INVALID_INPUT", "Недопустимый лимит namespace entries.");
        const entry = readNamespace(path);
        if (!entry.identity) return null;
        if (!entry.children || entry.children.length > maximumEntries)
          failure("LIMIT_EXCEEDED", "Namespace превышает лимит запроса.");
        return entry.children
          .filter((child) => child.kind === "directory")
          .map((child) => {
            const nested = `${path}/${child.name}`;
            assertReadAccess(this.options, nested);
            track(nested);
            return nested;
          });
      },
    };
    const includeDescriptor = (
      related: ResolvedArtifactDescriptor | ResolvedFolderDescriptor,
    ) => {
      for (const required of related.requiredCheckRefs)
        if (!related.validatedChecks.includes(required)) checks.add(required);
      refs.push(related.folderPolicyRef);
      if ("metadataProfileRef" in related) {
        refs.push(related.metadataProfileRef);
        if (related.templateRef) refs.push(related.templateRef);
      }
      related.readPaths.forEach(track);
    };
    let totalDiff = 0;
    for (const action of actions) {
      const index = inputs.length;
      let projectMove: ResolvedArtifactMove | undefined;
      let descriptor: ResolvedArtifactDescriptor | ResolvedFolderDescriptor,
        bytes: Uint8Array | null = null,
        diff: string | null = null,
        sourceDescriptor: ResolvedArtifactDescriptor | undefined;
      const targetPath = action.kind === "move" ? action.to : action.path;
      let sourceIdentity:
        | import("./EngineeringFilesystem.types.ts").FilesystemIdentity
        | undefined;
      let mode: number | undefined;
      if (action.kind === "create_file") {
        bytes = this.content.read(
          action.contentRef,
          hashEngineeringValue(this.options.principal),
        ).bytes;
        descriptor = this.descriptors.resolveFile({
          path: action.path,
          artifactKind: action.artifactKind,
          content: bytes,
        });
        let text: string;
        try {
          text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
        } catch {
          failure("UNSUPPORTED", "Preview поддерживает только UTF-8 текст.");
        }
        diff =
          `--- /dev/null\n+++ b/${action.path}\n` +
          text
            .split("\n")
            .map((line) => "+" + line)
            .join("\n");
        totalDiff += Buffer.byteLength(diff);
        if (totalDiff > 128 * 1024)
          failure("LIMIT_EXCEEDED", "Полный preview превышает лимит 128 KiB.");
      } else if (action.kind === "edit_file") {
        bytes = this.content.read(
          action.contentRef,
          hashEngineeringValue(this.options.principal),
        ).bytes;
        const source = this.checkout.entry(action.path);
        if (
          !source.identity ||
          source.identity.kind !== "file" ||
          source.identity.sha256 !== action.expectedSha256
        )
          failure(
            "CONFLICT",
            "Исходная версия файла изменилась или недоступна.",
          );
        sourceIdentity = source.identity;
        mode = source.identity.mode;
        const original = this.checkout.read(action.path);
        if (sha256Bytes(original) !== action.expectedSha256)
          failure("CONFLICT", "Исходные bytes не совпадают с expectedSha256.");
        const matched = this.resolveExistingFileProfile(action.path, original);
        descriptor = this.descriptors.resolveFile({
          path: action.path,
          artifactKind: matched.artifactKind,
          content: bytes,
        });
        sourceDescriptor = matched.descriptor;
        let oldText: string, newText: string;
        try {
          oldText = new TextDecoder("utf-8", { fatal: true }).decode(original);
          newText = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
        } catch {
          failure(
            "UNSUPPORTED",
            "Edit preview поддерживает только UTF-8 текст.",
          );
        }
        diff =
          `--- a/${action.path}\n+++ b/${action.path}\n` +
          oldText
            .split("\n")
            .map((line) => "-" + line)
            .join("\n") +
          "\n" +
          newText
            .split("\n")
            .map((line) => "+" + line)
            .join("\n");
        totalDiff += Buffer.byteLength(diff);
        if (totalDiff > 128 * 1024)
          failure("LIMIT_EXCEEDED", "Полный preview превышает лимит 128 KiB.");
      } else if (action.kind === "move") {
        const source = this.checkout.entry(action.from);
        if (source.identity?.kind === "directory") {
          if (actions.length !== 1)
            failure(
              "UNSUPPORTED",
              "Directory move является единственным исходным action batch.",
            );
          const prepared = prepareDirectoryFilesystemMove(
            this.checkout,
            this.descriptors,
            action.from,
            action.to,
            action.expectedVersion,
            inventory,
          );
          if (
            prepared.inputs.some((input) => input.kind === "edit_file") &&
            typeof this.options.native.renameExchange !== "function"
          )
            failure(
              "UNSUPPORTED",
              "Directory metadata edits требуют native exchange.",
            );
          inputs.push(...prepared.inputs);
          effects.push(...prepared.effects);
          prepared.descriptors.forEach(includeDescriptor);
          prepared.trackedPaths.forEach(track);
          for (const entry of prepared.sourceEntries) {
            const previous = observedNamespaces.get(entry.path);
            if (
              previous &&
              hashEngineeringValue(previous) !== hashEngineeringValue(entry)
            )
              failure("CONFLICT", "Дерево изменилось при обходе references.");
            observedNamespaces.set(entry.path, entry);
          }
          continue;
        }
        if (!source.identity || source.identity.kind !== "file")
          failure("UNSUPPORTED", "Move поддерживает только authored-файлы.");
        const original = this.checkout.read(action.from);
        if (
          source.identity.sha256 !== action.expectedVersion ||
          sha256Bytes(original) !== action.expectedVersion
        )
          failure("CONFLICT", "Исходная версия move изменилась.");
        sourceIdentity = source.identity;
        const matched = this.resolveExistingFileProfile(action.from, original);
        if (this.descriptors.prepareMove) {
          projectMove = this.descriptors.prepareMove(
            {
              from: action.from,
              to: action.to,
              artifactKind: matched.artifactKind,
              content: original,
            },
            inventory,
          );
          descriptor = projectMove.descriptor;
          projectMove.readPaths.forEach(track);
        } else
          try {
            descriptor = this.descriptors.resolveFile({
              path: action.to,
              artifactKind: matched.artifactKind,
              content: original,
            });
          } catch (error) {
            // Move сохраняет bytes: несовместимая metadata назначения требует отдельного resolver.
            if (
              error instanceof EngineeringFailure &&
              error.code === "INVALID_INPUT"
            )
              failure(
                "UNSUPPORTED",
                "Metadata файла не допускает перенос без отдельной синхронизации назначения.",
              );
            throw error;
          }
        sourceDescriptor = matched.descriptor;
        if (sourceDescriptor.ownerRef !== descriptor.ownerRef)
          failure("FORBIDDEN", "Move не может менять owner артефакта.");
        diff = null;
      } else if (action.kind === "remove") {
        const source = this.checkout.entry(action.path);
        if (!source.identity || source.identity.kind !== "file")
          failure(
            "UNSUPPORTED",
            "Quarantine remove поддерживает только authored-файлы.",
          );
        const original = this.checkout.read(action.path);
        if (
          source.identity.sha256 !== action.expectedVersion ||
          sha256Bytes(original) !== action.expectedVersion
        )
          failure("CONFLICT", "Исходная версия remove изменилась.");
        sourceIdentity = source.identity;
        descriptor = this.resolveExistingFileProfile(
          action.path,
          original,
        ).descriptor;
        try {
          const text = new TextDecoder("utf-8", { fatal: true }).decode(
            original,
          );
          diff =
            `--- a/${action.path}\n+++ /dev/null\n` +
            text
              .split("\n")
              .map((line) => "-" + line)
              .join("\n");
        } catch {
          failure(
            "UNSUPPORTED",
            "Remove preview поддерживает только UTF-8 текст.",
          );
        }
        totalDiff += Buffer.byteLength(diff);
        if (totalDiff > 128 * 1024)
          failure("LIMIT_EXCEEDED", "Полный preview превышает лимит 128 KiB.");
      } else if (action.kind === "create_directory")
        descriptor = this.descriptors.resolveDirectory({
          path: action.path,
          purpose: action.purpose,
          folderPolicyId: action.folderPolicyId,
          plannedFilePaths: files,
        });
      else failure("UNSUPPORTED", "Неподдержанное filesystem действие.");
      const relatedDescriptors = sourceDescriptor
        ? [sourceDescriptor, descriptor]
        : [descriptor];
      relatedDescriptors.forEach(includeDescriptor);
      for (const path of [
        ...(action.kind === "move" ? [action.from, action.to] : [action.path]),
        ...relatedDescriptors.flatMap((value) => value.readPaths),
      ])
        for (const ancestor of ancestorPaths(path)) tracked.add(ancestor);
      inputs.push({
        path: targetPath,
        kind: action.kind,
        ...(action.kind === "move" ? { fromPath: action.from } : {}),
        index,
        bytes,
        sourceIdentity,
        mode,
      });
      effects.push({
        kind: action.kind,
        paths:
          action.kind === "move" ? [action.from, action.to] : [action.path],
        description:
          action.kind === "create_file"
            ? `Создать ${action.artifactKind}`
            : action.kind === "edit_file"
              ? `Редактировать ${"kindId" in descriptor ? descriptor.kindId : "artifact"}`
              : action.kind === "create_directory"
                ? `Создать каталог: ${action.purpose}`
                : action.kind === "move"
                  ? `Перенести ${"kindId" in descriptor ? descriptor.kindId : "authored-файл"}`
                  : `Поместить ${"kindId" in descriptor ? descriptor.kindId : "authored-файл"} в private quarantine`,
        diff,
        contentSha256:
          bytes !== null
            ? sha256Bytes(bytes)
            : action.kind === "move"
              ? (sourceIdentity?.sha256 ?? null)
              : null,
      });
      if (projectMove && action.kind === "move") {
        const appendEdit = (
          path: string,
          original: Uint8Array,
          content: Uint8Array,
          related: ResolvedArtifactDescriptor,
          identity: NonNullable<typeof sourceIdentity>,
        ) => {
          if (typeof this.options.native.renameExchange !== "function")
            failure("UNSUPPORTED", "Project move требует native atomic edit.");
          includeDescriptor(related);
          track(path);
          const diff = buildFilesystemDiff(path, original, content);
          totalDiff += Buffer.byteLength(diff);
          if (totalDiff > 128 * 1024)
            failure(
              "LIMIT_EXCEEDED",
              "Полный preview превышает лимит 128 KiB.",
            );
          inputs.push({
            path,
            kind: "edit_file",
            index: inputs.length,
            bytes: content,
            sourceIdentity: identity,
            mode: identity.mode,
          });
          effects.push({
            kind: "edit_file",
            paths: [path],
            description:
              path === action.to
                ? "Согласовать metadata и references назначения"
                : `Обновить references consumer ${related.kindId}`,
            diff,
            contentSha256: sha256Bytes(content),
          });
        };
        const original = this.checkout.read(action.from);
        if (sha256Bytes(original) !== sourceIdentity!.sha256)
          failure("CONFLICT", "Source move изменился во время подготовки.");
        if (sha256Bytes(projectMove.content) !== sourceIdentity!.sha256)
          appendEdit(
            action.to,
            original,
            projectMove.content,
            projectMove.descriptor,
            sourceIdentity!,
          );
        for (const edit of projectMove.edits) {
          if (reservedPaths.has(edit.path))
            failure(
              "CONFLICT",
              "Dependent edit пересекается с явным action или другим edit.",
            );
          reservedPaths.add(edit.path);
          const entry = this.checkout.entry(edit.path),
            before = this.checkout.read(edit.path);
          if (
            entry.identity?.kind !== "file" ||
            entry.identity.sha256 !== edit.expectedSha256 ||
            sha256Bytes(before) !== edit.expectedSha256
          )
            failure("CONFLICT", "Исходная версия dependent edit изменилась.");
          const existing = this.resolveExistingFileProfile(
            edit.path,
            before,
            "dependent_edit",
          ).descriptor;
          if (
            existing.ownerRef !== edit.descriptor.ownerRef ||
            existing.kindId !== edit.descriptor.kindId
          )
            failure(
              "FORBIDDEN",
              "Dependent edit не может менять owner или kind.",
            );
          includeDescriptor(existing);
          appendEdit(
            edit.path,
            before,
            edit.content,
            edit.descriptor,
            entry.identity,
          );
        }
      }
    }
    if (inputs.length > 64)
      failure("LIMIT_EXCEEDED", "Развёрнутый план превышает 64 effects.");
    // Inventory описывает исходные consumers. Соседний file action не может добавить
    // неучтённую ссылку либо изменить прочитанный контракт после вычисления resolver.
    if (observedNamespaces.size)
      for (const action of actions) {
        if (action.kind === "move" || action.kind === "create_directory")
          continue;
        if (
          this.references.has(action.path) ||
          [...observedNamespaces.keys()].some((root) =>
            action.path.startsWith(root + "/"),
          )
        )
          failure(
            "UNSUPPORTED",
            "Project move не совмещается с явными file actions в inventory или его read dependencies.",
          );
      }
    if (checks.size)
      failure(
        "UNSUPPORTED",
        "Обязательные проверки этого binding ещё не подключены.",
      );
    for (const path of this.references.keys())
      for (const ancestor of ancestorPaths(path)) tracked.add(ancestor);
    for (const path of observedNamespaces.keys()) track(path);
    if (tracked.size > 512)
      failure("LIMIT_EXCEEDED", "Manifest содержит слишком много путей.");
    const trackedPaths = [...tracked].sort(),
      before = this.readAllowedManifest(trackedPaths);
    for (const [path, hash] of this.references)
      if (
        hash === null
          ? before.find((e) => e.path === path)?.identity !== null
          : before.find((e) => e.path === path)?.identity?.sha256 !== hash
      )
        failure(
          "CONFLICT",
          "Прочитанный источник изменился во время планирования.",
        );
    for (const [path, entry] of observedNamespaces)
      if (
        hashEngineeringValue(before.find((value) => value.path === path)) !==
        hashEngineeringValue(entry)
      )
        failure(
          "CONFLICT",
          "Namespace inventory изменился во время подготовки.",
        );
    assertCreationNamespace(
      before,
      inputs
        .filter(
          (input) =>
            input.kind === "create_file" ||
            input.kind === "create_directory" ||
            input.kind === "move",
        )
        .flatMap(
          (input) =>
            effects[input.index].movedArtifacts?.map((item) => item.to) ?? [
              input.path,
            ],
        ),
      inputs,
    );
    // Откажемся до staging при заведомо слишком большом namespace/preview.
    canonicalEngineeringJson({ before, effects }, { maxBytes: 192 * 1024 });
    const prepared = this.staging.create(inputs);
    const manifest: CreationManifest = {
      version: 1,
      ...prepared,
      trackedPaths,
      before,
      bindingHash: this.descriptors.definitionHash,
    };
    const snapshots = expectedSnapshots(manifest);
    if (this.currentSnapshot(manifest) !== snapshots[0])
      failure("CONFLICT", "Исходный manifest изменился во время подготовки.");
    return {
      targetVersion: hashEngineeringValue({
        root: this.checkout.rootIdentity,
        bindingHash: this.descriptors.definitionHash,
      }),
      sourceManifestHash: snapshots[0],
      policyRefs: [
        ...new Map(refs.map((r) => [r.id + ":" + r.version, r])).values(),
      ],
      recipeRefs: [],
      effects,
      checkSelection: [],
      coverage: {
        complete: true,
        limitations: [
          "Доступны только profiles зарегистрированного trusted binding; семантические проверки проекта выполняются отдельно.",
          ...(observedNamespaces.size
            ? [
                "Reference coverage ограничено trusted referenceRoots host policy; внешние consumers не исследуются.",
              ]
            : []),
          "Поддержаны authored file move/quarantine и bounded directory move одного owner; directory remove отклоняется.",
          "Приватные staging/content сохраняются до отдельной политики retention; квота 128 MiB.",
        ],
      },
      snapshots,
      privateData: manifest as unknown as JsonValue,
    };
  }
  private resolveExistingFileProfile(
    path: string,
    content: Uint8Array,
    purpose?: "dependent_edit",
  ) {
    if (!this.descriptors.resolveExistingFile)
      failure(
        "UNSUPPORTED",
        "Trusted binding не разрешает profile существующего файла.",
      );
    const descriptor = this.descriptors.resolveExistingFile({
      path,
      content,
      purpose,
    });
    return { artifactKind: descriptor.kindId, descriptor };
  }
  private currentSnapshot(manifest: CreationManifest) {
    const stage = this.staging.open(manifest);
    try {
      return manifestDigest(
        manifest,
        this.readAllowedManifest(manifest.trackedPaths),
        manifest.steps.flatMap((step) =>
          step.stagedName === null ? [] : [stage.entry(step.stagedName)],
        ),
        this.descriptors.definitionHash,
        stage.rootIdentity,
      );
    } finally {
      stage.close();
    }
  }
  private readAllowedManifest(paths: string[]) {
    paths.forEach((path) => assertReadAccess(this.options, path));
    return readManifest(this.checkout, paths);
  }
  snapshot(plan: FrozenPlan) {
    return this.currentSnapshot(
      parseCreationManifest(plan.prepared.privateData),
    );
  }
  confirmDurable(plan: FrozenPlan, index: number) {
    const manifest = parseCreationManifest(plan.prepared.privateData);
    if (this.currentSnapshot(manifest) !== plan.prepared.snapshots[index + 1])
      failure(
        "CONFLICT",
        "Before durability ожидался подтверждаемый after manifest.",
      );
    this.staging.confirmDurable(manifest, index);
  }
  apply(plan: FrozenPlan, index: number) {
    const manifest = parseCreationManifest(plan.prepared.privateData);
    if (this.currentSnapshot(manifest) !== plan.prepared.snapshots[index])
      failure("CONFLICT", "Manifest изменился перед публикацией.");
    this.staging.publish(manifest, index);
  }
}

function assertReadAccess(options: LocalFilesystemOptions, path: string) {
  if (options.canReadReference && options.canReadReference(path) !== true)
    failure("FORBIDDEN", "Нет актуального допуска к чтению reference.");
}
