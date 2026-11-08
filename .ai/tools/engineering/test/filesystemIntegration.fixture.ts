/**
 * @file .ai/tools/engineering/test/filesystemIntegration.fixture.ts
 * @version 1.4.1
 * @date 2026-10-30
 * @description Собирает изолированный production binding с реальными native ports для integration checks.
 * @see documentation/architecture/engineering-operations.md
 */
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";
import {
  createLocalFilesystemPorts,
  EngineeringRuntime,
  loadEngineeringNative,
  openEngineeringStore,
  sha256Bytes,
} from "@realize/engineering-runtime";
import type {
  LoadEngineeringNativeInput,
  OperationView,
} from "@realize/engineering-runtime";
import {
  createProjectArtifactBinding,
  renderSourceTemplate,
  renderAiTemplate,
} from "../src/projectEngineering.index.ts";
import {
  BASE_AI_TEMPLATE,
  BINDING_SOURCE_PATHS,
  SOURCE_HEADER_TEMPLATE,
  SOURCE_RULE_REFS,
  SOURCE_VALIDATOR_PATHS,
  TEMPLATE_RULE_REFS,
  TEMPLATE_VALIDATOR_PATHS,
  MOVE_SOURCE_PATHS,
} from "../src/projectArtifactProfiles.config.ts";
import type {
  ProjectMovePolicy,
  ProjectFolderPolicy,
} from "../src/projectEngineering.index.ts";

export const targetId = "b145c4af-c1e7-4d7b-9746-3c8afcbf57f1";
export const principal = {
  actorKind: "user",
  actorId: "1",
  clientId: "fixture",
};
export const policySource =
  ".ai/tools/engineering/src/projectArtifactProfiles.config.ts";
export const sourcePath = "src/nested/calculateTotal.util.ts";
export const aiPath = ".ai/templates/engineering/TEMPLATE-ARTIFACT-REVIEW.md";
export function source(path = sourcePath) {
  return renderSourceTemplate({
    path,
    descriptionRu: "Вычисляет сумму значений.",
    createdOn: "2026-10-26",
    body: "export function calculateTotal(values: number[]): number { return values.reduce((sum, value) => sum + value, 0); }",
    seeRefs: ["documentation/architecture/engineering-artifacts.md"],
  });
}
export function template() {
  return renderAiTemplate({
    path: aiPath,
    templateId: "TEMPLATE-ARTIFACT-REVIEW",
    titleRu: "Проверка артефакта",
    purposeRu: "Фиксирует результат проверки.",
    usageRu: "Заполни результат текущей проверки.",
    sections: [
      { headingRu: "Критерии", body: "Проверь назначение и ограничения." },
    ],
    relatedArtifacts: [],
  });
}
export function contentCommand(bytes: Uint8Array) {
  return {
    schemaVersion: 1,
    targetId,
    requestId: randomUUID(),
    mediaType: "text/plain",
    bytes: Buffer.from(bytes).toString("base64"),
    sha256: sha256Bytes(bytes),
  };
}
export function applyCommand(view: OperationView) {
  return {
    schemaVersion: 1,
    operationId: view.operationId,
    planId: view.planRef!.planId,
    planHash: view.planRef!.planHash,
    requestId: randomUUID(),
    expectedRevision: view.revision,
  };
}
export function getCommand(view: OperationView) {
  return { schemaVersion: 1, operationId: view.operationId };
}
export function planCommand<Action>(actions: Action[]) {
  return {
    schemaVersion: 1,
    targetId,
    requestId: randomUUID(),
    taskRefs: [],
    intent: { kind: "file_batch", actions },
  };
}
export const hasCode = (code: string) => (error: unknown) =>
  !!error &&
  typeof error === "object" &&
  "code" in error &&
  error.code === code;

export function filesystemFixture(
  nativeInput: LoadEngineeringNativeInput,
  directory?: string,
  actor = principal,
  requiredChecks: readonly string[] = [],
  movePolicy?: ProjectMovePolicy,
  extraFolderPolicies: readonly ProjectFolderPolicy[] = [],
  sourceKinds: readonly string[] = ["source.util"],
) {
  const root =
      directory ?? mkdtempSync(join(homedir(), ".cache", "engineering-files-")),
    checkout = join(root, "checkout");
  if (!directory) {
    mkdirSync(checkout);
    mkdirSync(join(checkout, "src"));
    const paths = new Set([
      BASE_AI_TEMPLATE,
      SOURCE_HEADER_TEMPLATE,
      ...BINDING_SOURCE_PATHS,
      ...SOURCE_RULE_REFS,
      ...SOURCE_VALIDATOR_PATHS,
      ...TEMPLATE_RULE_REFS,
      ...TEMPLATE_VALIDATOR_PATHS,
      ...MOVE_SOURCE_PATHS,
      "package.json",
      "documentation/architecture/engineering-artifacts.md",
    ]);
    for (const path of paths) {
      mkdirSync(dirname(join(checkout, path)), { recursive: true });
      writeFileSync(join(checkout, path), readFileSync(path));
    }
  }
  const store = openEngineeringStore({
    stateDirectory: join(root, "journal"),
    checkoutRoot: checkout,
    targetId,
    workspaceId: "a626cd72-08a4-4dd6-a1f2-2d87a42b1162",
    installationId: "4aa8e18c-8a21-40fb-8ce0-1e54fde7eb84",
  });
  const native = loadEngineeringNative(nativeInput);
  const control = {
    allowed: true,
    deniedPaths: [] as string[],
    deniedReadPaths: [] as string[],
    referenceReads: [] as string[],
    readAccessChecks: [] as string[],
    crash: false,
    crashBeforeWrite: false,
    crashAtWrite: 0,
    failAfterWrite: false,
    failDurability: false,
    confirmations: 0,
    writes: 0,
    now: Date.now(),
    requiredChecks: [...requiredChecks],
    afterWrite: undefined as (() => void) | undefined,
  };
  function beforeWrite() {
    if (
      control.crashBeforeWrite &&
      (!control.crashAtWrite || control.writes + 1 === control.crashAtWrite)
    )
      process.kill(process.pid, "SIGKILL");
  }
  function recordWrite() {
    control.writes++;
    control.afterWrite?.();
    if (
      control.crash &&
      (!control.crashAtWrite || control.writes === control.crashAtWrite)
    )
      process.kill(process.pid, "SIGKILL");
    if (control.failAfterWrite) {
      control.failAfterWrite = false;
      throw Error("lost publication outcome");
    }
  }
  const ports = createLocalFilesystemPorts({
    store,
    principal: actor,
    filesDirectory: join(root, "files"),
    canReadReference: (path) => {
      control.readAccessChecks.push(path);
      return !control.deniedReadPaths.includes(path);
    },
    native: {
      inspectFd: native.inspectFd,
      renameExchange(...args) {
        beforeWrite();
        native.renameExchange!(...args);
        recordWrite();
      },
      renameNoReplace(...args) {
        if (!args[1].endsWith(".tmp")) beforeWrite();
        native.renameNoReplace(...args);
        if (!args[1].endsWith(".tmp")) recordWrite();
      },
    },
    now: () => control.now,
    descriptors: (readReference) =>
      createProjectArtifactBinding({
        readReference: (path) => {
          control.referenceReads.push(path);
          return readReference(path);
        },
        movePolicy,
        folderPolicies: [
          {
            id: "source",
            version: "1",
            root: "src",
            ownerRef: "fixture",
            purpose: "Исходники",
            boundary: "owner",
            allowedKinds: [...sourceKinds],
            allowedProvenance: ["authored"],
            sourcePaths: [policySource],
            requiredCheckRefs: control.requiredChecks,
          },
          {
            id: "templates",
            version: "1",
            root: ".ai/templates",
            ownerRef: "ai",
            purpose: "Шаблоны",
            boundary: "owner",
            allowedKinds: ["ai.template"],
            allowedProvenance: ["authored"],
            sourcePaths: [policySource],
          },
          ...extraFolderPolicies,
        ],
      }),
  });
  const options = {
    store,
    principal: actor,
    planner: ports.planner,
    effects: {
      mode: "in_process_sync" as const,
      apply: ports.effects.apply.bind(ports.effects),
      confirmDurable(
        plan: Parameters<typeof ports.effects.apply>[0],
        index: number,
      ) {
        control.confirmations++;
        if (control.failDurability)
          throw Error("durability barrier unavailable");
        ports.effects.confirmDurable!(plan, index);
      },
    },
    content: ports.content,
    now: () => control.now,
    async authorize(
      admission: import("@realize/engineering-runtime").Admission,
    ) {
      if (
        !control.allowed ||
        admission.effect?.paths.some((path) =>
          control.deniedPaths.includes(path),
        )
      )
        throw Error("revoked");
      return { scopeVersion: "1" };
    },
  };
  const runtime = new EngineeringRuntime(options);
  let closed = false;
  return {
    root,
    checkout,
    store,
    ports,
    options,
    runtime,
    control,
    close() {
      if (closed) return;
      closed = true;
      ports.close();
      store.close();
    },
  };
}
