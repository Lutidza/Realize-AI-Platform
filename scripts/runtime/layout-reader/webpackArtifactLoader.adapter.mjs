/**
 * @file scripts/runtime/layout-reader/webpackArtifactLoader.adapter.mjs
 * @version 1.0.0
 * @date 2026-11-21
 * @description Извлекает webpack factories через AST и исполняет только выбранное замыкание без startup/внешних imports.
 * @see documentation/reports/2026-11-21-layout-reader-delivery-rollback-audit.md
 */
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import vm from "node:vm";
import { artifactLimits, sha256 } from "./readLayoutReaderArtifact.adapter.mjs";
import { proveCompiledInlineFunctions } from "./proveCompiledFunctionScope.util.mjs";

const { parse } = createRequire(import.meta.url)("next/dist/compiled/acorn");
export const artifactProbeToolVersions = Object.freeze({
  node: process.versions.node,
  next: createRequire(import.meta.url)("next/package.json").version,
  acorn: createRequire(import.meta.url)("next/dist/compiled/acorn").version,
  eslintScope: createRequire(import.meta.url)("eslint-scope/package.json")
    .version,
});
const propertyName = (node) =>
  node?.type === "Identifier"
    ? node.name
    : node?.type === "Literal"
      ? String(node.value)
      : undefined;

const hasStrictDirective = (node) => {
  const body =
    node.type === "Program"
      ? node.body
      : [
            "FunctionDeclaration",
            "FunctionExpression",
            "ArrowFunctionExpression",
          ].includes(node.type) && node.body?.type === "BlockStatement"
        ? node.body.body
        : [];
  for (const statement of body ?? []) {
    if (typeof statement.directive !== "string") break;
    if (statement.directive === "use strict") return true;
  }
  return false;
};

/** Next entry объявляет свой точный shared chunk graph в runtime.X; startup при этом не исполняется. */
export function selectServerEntryFiles(files, entryPath) {
  const expectedEntry = ".next/server/app/(payload)/api/[...slug]/route.js";
  if (entryPath !== expectedEntry)
    throw new Error("Unsupported server API entry owner path.");
  const entries = files.filter(
    (file) => file.side === "server" && file.path === entryPath,
  );
  if (entries.length !== 1)
    throw new Error("Selected server API entry must be unique in artifact.");
  const entry = entries[0];
  const ast = parse(entry.source, {
    ecmaVersion: "latest",
    sourceType: "script",
  });
  const fail = () => {
    throw new Error("Unsupported bound server API startup graph.");
  };
  const identifier = (node, name) =>
    node?.type === "Identifier" && node.name === name;
  const member = (node, name, key) =>
    node?.type === "MemberExpression" &&
    !node.computed &&
    identifier(node.object, name) &&
    identifier(node.property, key);
  const graphId = (node) =>
    node?.type === "Literal" &&
    ((typeof node.value === "number" &&
      Number.isSafeInteger(node.value) &&
      node.value >= 0) ||
      (typeof node.value === "string" &&
        /^[A-Za-z0-9_-]{1,128}$/.test(node.value)));
  const program = ast.body.filter((node) => !node.directive);
  const wrapper = program[0]?.expression;
  if (
    program.length !== 1 ||
    program[0].type !== "ExpressionStatement" ||
    wrapper?.type !== "CallExpression" ||
    wrapper.arguments.length ||
    !["ArrowFunctionExpression", "FunctionExpression"].includes(
      wrapper.callee.type,
    ) ||
    wrapper.callee.async ||
    wrapper.callee.generator ||
    wrapper.callee.params.length ||
    wrapper.callee.body.type !== "BlockStatement"
  )
    fail();
  const atoms = wrapper.callee.body.body.flatMap((statement) => {
    if (statement.directive) return [];
    if (statement.type === "VariableDeclaration")
      return statement.declarations.map((declaration) => ({
        type: "declaration",
        declaration,
      }));
    if (statement.type !== "ExpressionStatement") fail();
    return (
      statement.expression.type === "SequenceExpression"
        ? statement.expression.expressions
        : [statement.expression]
    ).map((expression) => ({ type: "expression", expression }));
  });
  const declarations = new Map();
  for (const [index, atom] of atoms.entries()) {
    if (atom.type !== "declaration") continue;
    const { id, init } = atom.declaration;
    if (
      id.type !== "Identifier" ||
      ["require", "module", "exports"].includes(id.name) ||
      declarations.has(id.name)
    )
      fail();
    declarations.set(id.name, { init, index });
  }
  const owners = [...declarations].filter(
    ([, value]) =>
      value.init?.type === "ObjectExpression" && !value.init.properties.length,
  );
  const runtimes = [...declarations].filter(
    ([, value]) =>
      value.init?.type === "CallExpression" &&
      identifier(value.init.callee, "require") &&
      value.init.arguments.length === 1 &&
      value.init.arguments[0]?.type === "Literal" &&
      value.init.arguments[0].value === "../../../../webpack-runtime.js",
  );
  if (owners.length !== 1 || runtimes.length !== 1 || declarations.size !== 3)
    fail();
  const [owner, ownerDeclaration] = owners[0];
  const [runtime, runtimeDeclaration] = runtimes[0];
  const properties = new Map();
  let registration;
  let exported;
  for (const [index, atom] of atoms.entries()) {
    if (atom.type !== "expression") continue;
    const expression = atom.expression;
    if (
      expression.type === "AssignmentExpression" &&
      expression.operator === "=" &&
      expression.left.type === "MemberExpression" &&
      !expression.left.computed &&
      identifier(expression.left.object, owner)
    ) {
      const key = propertyName(expression.left.property);
      if (
        !["id", "ids", "modules"].includes(key) ||
        properties.has(key) ||
        index <= ownerDeclaration.index
      )
        fail();
      properties.set(key, { value: expression.right, index });
    } else if (
      expression.type === "CallExpression" &&
      member(expression.callee, runtime, "C") &&
      expression.arguments.length === 1 &&
      identifier(expression.arguments[0], owner)
    ) {
      if (registration !== undefined || index <= runtimeDeclaration.index)
        fail();
      registration = index;
    } else if (
      expression.type === "AssignmentExpression" &&
      expression.operator === "=" &&
      member(expression.left, "module", "exports")
    ) {
      if (exported !== undefined || expression.right.type !== "Identifier")
        fail();
      exported = { name: expression.right.name, index };
    } else fail();
  }
  const ownId = properties.get("id");
  const ownIds = properties.get("ids");
  const modules = properties.get("modules");
  if (
    properties.size !== 3 ||
    registration === undefined ||
    !exported ||
    !graphId(ownId?.value) ||
    ownIds?.value.type !== "ArrayExpression" ||
    ownIds.value.elements.length !== 1 ||
    !graphId(ownIds.value.elements[0]) ||
    String(ownId.value.value) !== String(ownIds.value.elements[0].value) ||
    modules?.value.type !== "ObjectExpression" ||
    [...properties.values()].some(({ index }) => index >= registration)
  )
    fail();
  const output = declarations.get(exported.name);
  const call = output?.init;
  if (
    !output ||
    output.index <= registration ||
    exported.index <= output.index ||
    call?.type !== "CallExpression" ||
    !member(call.callee, runtime, "X") ||
    call.arguments.length !== 3 ||
    call.arguments[0]?.type !== "Literal" ||
    call.arguments[0].value !== 0 ||
    call.arguments[1]?.type !== "ArrayExpression"
  )
    fail();
  const ids = call.arguments[1].elements;
  if (
    !ids.length ||
    ids.length > 1000 ||
    ids.some((id) => !graphId(id)) ||
    new Set(ids.map((id) => String(id.value))).size !== ids.length
  )
    fail();
  const callback = call.arguments[2];
  const start = callback?.body;
  const root = start?.arguments?.[0];
  if (
    callback?.type !== "ArrowFunctionExpression" ||
    callback.async ||
    callback.params.length ||
    start?.type !== "CallExpression" ||
    !identifier(start.callee, runtime) ||
    start.arguments.length !== 1 ||
    root?.type !== "AssignmentExpression" ||
    root.operator !== "=" ||
    !member(root.left, runtime, "s") ||
    !graphId(root.right)
  )
    fail();
  const moduleKeys = new Set();
  for (const property of modules.value.properties) {
    const key = propertyName(property.key);
    if (
      property.type !== "Property" ||
      property.kind !== "init" ||
      property.computed ||
      property.method ||
      property.shorthand ||
      !key ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(key) ||
      moduleKeys.has(key) ||
      !["FunctionExpression", "ArrowFunctionExpression"].includes(
        property.value?.type,
      )
    )
      fail();
    moduleKeys.add(key);
  }
  const rootFactories = modules.value.properties.filter(
    (property) => propertyName(property.key) === String(root.right.value),
  );
  if (rootFactories.length !== 1) fail();
  const selected = [entry];
  for (const id of ids.map((node) => String(node.value))) {
    const chunks = files.filter(
      (candidate) =>
        candidate.side === "server" &&
        candidate.path === `.next/server/chunks/${id}.js`,
    );
    if (chunks.length !== 1)
      throw new Error(
        "Server entry dependency chunk must be unique in artifact.",
      );
    selected.push(chunks[0]);
  }
  return selected;
}

/** Client readers берутся только из chunks, объявленных compiled manifest страницы оформления. */
export function selectClientManifestFiles(files, manifestPath) {
  const expectedManifest =
    ".next/server/app/(system-admin)/system/appearance/page_client-reference-manifest.js";
  const expectedRoute = "/(system-admin)/system/appearance/page";
  if (manifestPath !== expectedManifest)
    throw new Error("Unsupported appearance client manifest owner path.");
  const manifests = files.filter(
    (file) => file.path === manifestPath && file.side === "server",
  );
  if (manifests.length !== 1)
    throw new Error(
      "Selected appearance client reference manifest must be unique.",
    );
  const manifest = manifests[0];
  const ast = parse(manifest.source, {
    ecmaVersion: "latest",
    sourceType: "script",
  });
  const registry = (node) =>
    node?.type === "MemberExpression" &&
    !node.computed &&
    node.object.type === "Identifier" &&
    node.object.name === "globalThis" &&
    node.property.type === "Identifier" &&
    node.property.name === "__RSC_MANIFEST";
  const statements = ast.body.filter((node) => !node.directive);
  const initialize = statements[0]?.expression;
  const assignment = statements[1]?.expression;
  const emptyObject = (node) =>
    node?.type === "ObjectExpression" && !node.properties.length;
  if (
    statements.length !== 2 ||
    statements.some((node) => node.type !== "ExpressionStatement") ||
    initialize?.type !== "AssignmentExpression" ||
    initialize.operator !== "=" ||
    !registry(initialize.left) ||
    !(
      emptyObject(initialize.right) ||
      (initialize.right.type === "LogicalExpression" &&
        initialize.right.operator === "||" &&
        registry(initialize.right.left) &&
        emptyObject(initialize.right.right))
    ) ||
    assignment?.type !== "AssignmentExpression" ||
    assignment.operator !== "=" ||
    assignment.left.type !== "MemberExpression" ||
    !assignment.left.computed ||
    !registry(assignment.left.object) ||
    assignment.left.property.type !== "Literal" ||
    assignment.left.property.value !== expectedRoute ||
    assignment.right.type !== "ObjectExpression"
  )
    throw new Error("Unsupported bound appearance client reference manifest.");
  const parsed = JSON.parse(
    manifest.source.slice(assignment.right.start, assignment.right.end),
  );
  if (!parsed.clientModules || typeof parsed.clientModules !== "object")
    throw new Error("Client reference manifest has no module graph.");
  // Manifest содержит ссылки других entry contexts; их union не является browser graph владельца UI.
  const owners = Object.entries(parsed.clientModules).filter(([key]) =>
    key.endsWith(
      "/src/components/admin/extensions/ExtensionManager.component.tsx",
    ),
  );
  if (owners.length !== 1)
    throw new Error(
      "Appearance client owner module must be unique in manifest.",
    );
  const owner = owners[0][1];
  if (
    !owner ||
    typeof owner !== "object" ||
    !Array.isArray(owner.chunks) ||
    owner.chunks.length > 2000 ||
    owner.chunks.some((chunk) => typeof chunk !== "string")
  )
    throw new Error("Appearance client owner has an unsupported chunk graph.");
  const paths = new Set(
    owner.chunks
      .filter(
        (path) =>
          typeof path === "string" &&
          /^static\/chunks\/[A-Za-z0-9_./%()[\]-]+\.js$/.test(path),
      )
      .map((path) => `.next/${path}`),
  );
  if (!paths.size || paths.size > 1000)
    throw new Error("Client manifest chunk bound failed.");
  return [...paths].map((path) => {
    const file = files.find(
      (candidate) => candidate.side === "client" && candidate.path === path,
    );
    if (!file) throw new Error(`Client manifest chunk is absent: ${path}`);
    return file;
  });
}

/** Файловый startup не исполняется: AST разрешает только factory object, не runtime callbacks. */
export function extractWebpackFactories(file) {
  const ast = parse(file.source, {
    ecmaVersion: "latest",
    sourceType: "script",
  });
  const found = new Map();
  const stack = [{ node: ast, strict: false }];
  while (stack.length) {
    const { node, strict: inheritedStrict } = stack.pop();
    if (!node || typeof node !== "object") continue;
    const strict =
      inheritedStrict ||
      hasStrictDirective(node) ||
      ["ClassDeclaration", "ClassExpression"].includes(node.type);
    let object;
    if (
      node.type === "AssignmentExpression" &&
      node.left.type === "MemberExpression" &&
      propertyName(node.left.property) === "modules" &&
      node.right.type === "ObjectExpression"
    )
      object = node.right;
    if (
      file.side === "client" &&
      node.type === "CallExpression" &&
      node.callee.type === "MemberExpression" &&
      propertyName(node.callee.property) === "push" &&
      node.arguments[0]?.type === "ArrayExpression" &&
      node.arguments[0].elements[0]?.type === "ArrayExpression" &&
      node.arguments[0].elements[1]?.type === "ObjectExpression"
    )
      object = node.arguments[0].elements[1];
    if (object) {
      for (const property of object.properties) {
        const id = propertyName(property.key);
        if (
          !id ||
          property.computed ||
          !["FunctionExpression", "ArrowFunctionExpression"].includes(
            property.value?.type,
          )
        )
          throw new Error(`Unsupported webpack factory shape in ${file.path}`);
        const source = file.source.slice(
          property.value.start,
          property.value.end,
        );
        if (found.has(id))
          throw new Error(
            `Duplicate webpack factory identity in one file: ${id}`,
          );
        found.set(id, {
          id,
          side: file.side,
          path: file.path,
          chunkHash: file.hash,
          hash: sha256(source),
          startOffsetUtf16: property.value.start,
          endOffsetUtf16: property.value.end,
          effectiveStrict: strict || hasStrictDirective(property.value),
          source,
        });
      }
      // Factory bodies are deliberately not traversed: nested arbitrary objects are not registry input.
      continue;
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value))
        stack.push(
          ...value
            .filter((entry) => entry && typeof entry === "object")
            .map((node) => ({ node, strict })),
        );
      else if (value && typeof value === "object")
        stack.push({ node: value, strict });
    }
  }
  return [...found.values()];
}

/** Добавляет только наблюдающие getters; удаление insertionText полностью восстанавливает original source. */
export function observeWebpackFactory(factory) {
  const wrapped = `(${factory.source})`;
  const ast = parse(wrapped, { ecmaVersion: "latest", ranges: true });
  const node = ast.body[0].expression;
  if (node.body.type !== "BlockStatement")
    return {
      source: factory.source,
      insertionText: "",
      lexicalNames: [],
      inlineFunctions: [],
    };
  const names = node.body.body.flatMap((statement) => {
    if (["FunctionDeclaration", "ClassDeclaration"].includes(statement.type))
      return statement.id ? [statement.id.name] : [];
    if (statement.type === "VariableDeclaration")
      return statement.declarations
        .filter((declaration) => declaration.id.type === "Identifier")
        .map((declaration) => declaration.id.name);
    return [];
  });
  const inlineFunctions = proveCompiledInlineFunctions(
    ast,
    node,
    factory.source,
    factory.effectiveStrict ?? false,
  );
  const lexicalNames = [...new Set(names)];
  if (!lexicalNames.length)
    return {
      source: factory.source,
      insertionText: "",
      lexicalNames,
      inlineFunctions: [],
    };
  const getters = [
    ...lexicalNames.map((name) => `get ${name}(){return ${name}}`),
    ...inlineFunctions.map(
      (entry) => `get ${entry.name}(){return (${entry.source})}`,
    ),
  ];
  const insertionText = `;globalThis.__artifactCaptures[${JSON.stringify(factory.id)}]={${getters.join(",")}};`;
  const insertionOffsetUtf16 = node.body.end - 2;
  return {
    source: `${factory.source.slice(0, insertionOffsetUtf16)}${insertionText}${factory.source.slice(insertionOffsetUtf16)}`,
    insertionText,
    lexicalNames,
    insertionOffsetUtf16,
    inlineFunctions,
  };
}

/** Static caller proof связывает literal disabled с теми же четырьмя scope-checked function bodies. */
export function findCompiledWriterPolicyCallsites(files, readers) {
  const expected = new Map(
    readers
      .filter((reader) =>
        [
          "prepareAppearance",
          "applyAppearance",
          "prepareShell",
          "applyShell",
        ].includes(reader.name),
      )
      .map((reader) => [reader.compiledFunctionSourceHash, reader.name]),
  );
  const matches = [];
  for (const file of files) {
    const ast = parse(file.source, {
      ecmaVersion: "latest",
      sourceType: "script",
    });
    const stack = [ast];
    while (stack.length) {
      const node = stack.pop();
      if (!node || typeof node !== "object") continue;
      if (
        node.type === "CallExpression" &&
        node.callee.type === "FunctionExpression" &&
        node.arguments[0]?.type === "ObjectExpression"
      ) {
        const sourceHash = sha256(
          file.source.slice(node.callee.start, node.callee.end),
        );
        const operation = expected.get(sourceHash);
        if (operation) {
          const properties = node.arguments[0].properties;
          const policies = properties.filter(
            (property) =>
              property.type === "Property" &&
              !property.computed &&
              propertyName(property.key) === "layoutAssignmentWrites",
          );
          if (
            policies.length !== 1 ||
            policies[0].value.type !== "Literal" ||
            policies[0].value.value !== "disabled" ||
            properties.some((property) => property.type === "SpreadElement")
          )
            throw new Error(
              "Compiled service writer policy is not an unconditional literal disabled.",
            );
          matches.push({
            operation,
            path: file.path,
            chunkHash: file.hash,
            callOffsetUtf16: node.start,
            policyPropertyOffsetUtf16: policies[0].start,
            calleeFunctionSourceHash: sourceHash,
          });
        }
      }
      for (const value of Object.values(node)) {
        if (Array.isArray(value))
          stack.push(
            ...value.filter((item) => item && typeof item === "object"),
          );
        else if (value && typeof value === "object") stack.push(value);
      }
    }
  }
  if (
    expected.size !== 4 ||
    [...expected.values()].some(
      (name) =>
        matches.filter((match) => match.operation === name).length !== 1,
    )
  )
    throw new Error(
      "Four exact compiled service writer policy callsites were not established.",
    );
  return matches;
}

/** VM является ограничителем исполнения доверенного compiled artifact, не sandbox для hostile JavaScript. */
export function createWebpackArtifactLoader(files, side) {
  const factories = new Map();
  for (const file of files.filter((candidate) => candidate.side === side)) {
    for (const factory of extractWebpackFactories(file)) {
      const prior = factories.get(factory.id);
      if (prior && prior.hash !== factory.hash)
        throw new Error(`Conflicting ${side} factory identity: ${factory.id}`);
      factories.set(factory.id, factory);
      if (factories.size > artifactLimits.factories)
        throw new Error("Artifact factory bound exceeded.");
    }
  }
  if (!factories.size) throw new Error(`No ${side} webpack factories found.`);
  const cache = new Map();
  const loaded = new Set();
  const blocked = new Set();
  const context = vm.createContext(Object.create(null), {
    name: `layout-reader-${side}`,
    codeGeneration: { strings: false, wasm: false },
    microtaskMode: "afterEvaluate",
  });
  context.Buffer = Object.freeze({ byteLength: Buffer.byteLength });
  const run = (source) =>
    new vm.Script(source, {
      filename: `layout-reader-${side}-probe.js`,
    }).runInContext(context, { timeout: artifactLimits.vmTimeoutMs });
  run(
    `globalThis.__probe = Object.create(null); globalThis.__artifactCaptures = Object.create(null); globalThis.structuredClone = value => JSON.parse(JSON.stringify(value));`,
  );

  function requireModule(rawId) {
    const id = String(rawId);
    if (cache.has(id)) return cache.get(id).exports;
    const factory = factories.get(id);
    if (!factory) {
      blocked.add(id);
      throw new Error(`External or absent artifact module denied: ${id}`);
    }
    const compiledModule = { exports: Object.create(null) };
    cache.set(id, compiledModule);
    loaded.add(id);
    context.__module = compiledModule;
    context.__require = webpackRequire;
    try {
      const observation = observeWebpackFactory(factory);
      factory.observation = {
        kind: "getters-appended-after-original-statements",
        insertionOffsetUtf16: observation.insertionOffsetUtf16,
        insertionChunkOffsetUtf16:
          factory.startOffsetUtf16 + (observation.insertionOffsetUtf16 ?? 0),
        insertionHash: sha256(observation.insertionText),
        observedSourceHash: sha256(observation.source),
      };
      factory.inlineFunctions = observation.inlineFunctions ?? [];
      run(
        `${factory.effectiveStrict ? '"use strict";' : ""}(${observation.source})(globalThis.__module, globalThis.__module.exports, globalThis.__require)`,
      );
      return compiledModule.exports;
    } catch (error) {
      cache.delete(id);
      throw error;
    }
  }

  // Разрешён единственный native capability: canonical SHA hashing, без fs/net/process/Payload.
  const externalRequire = (name) => {
    if (side === "server" && ["crypto", "node:crypto"].includes(name))
      return Object.freeze({ createHash });
    blocked.add(String(name));
    throw new Error(`Native import denied: ${String(name)}`);
  };
  context.require = externalRequire;
  const webpackRequire = Object.assign(requireModule, {
    d(exports, definitions) {
      for (const [key, getter] of Object.entries(definitions))
        if (!Object.hasOwn(exports, key))
          Object.defineProperty(exports, key, {
            enumerable: true,
            get: getter,
          });
    },
    r(exports) {
      Object.defineProperty(exports, "__esModule", { value: true });
      Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    },
    o: (object, key) => Object.hasOwn(object, key),
    n(module) {
      const getter = module?.__esModule ? () => module.default : () => module;
      webpackRequire.d(getter, { a: getter });
      return getter;
    },
    nmd(module) {
      module.paths = [];
      module.children ??= [];
      return module;
    },
    hmd(module) {
      return module;
    },
    t(value, mode) {
      if (mode & 1) value = requireModule(value);
      if (mode & 8 || (mode & 4 && value?.__esModule)) return value;
      const result = Object.create(null);
      webpackRequire.r(result);
      Object.defineProperty(result, "default", { enumerable: true, value });
      if (mode & 2 && value && typeof value === "object")
        for (const key of Object.keys(value))
          Object.defineProperty(result, key, {
            enumerable: true,
            get: () => value[key],
          });
      return result;
    },
  });
  for (const key of ["a", "e", "X", "O", "l", "f", "C"])
    webpackRequire[key] = () => {
      throw new Error(`Webpack runtime capability denied: ${key}`);
    };
  webpackRequire.g = context;

  function setJSON(key, value) {
    context.__json = JSON.stringify(value);
    context.__key = key;
    run("globalThis.__probe[globalThis.__key] = JSON.parse(globalThis.__json)");
  }
  function bind(key, value) {
    context.__probe[key] = value;
  }
  function evaluate(source) {
    return run(source);
  }
  function exportsFor(factory) {
    return requireModule(factory.id);
  }
  function capturesFor(factory) {
    requireModule(factory.id);
    return context.__artifactCaptures[factory.id] ?? Object.create(null);
  }
  function evidence() {
    return {
      side,
      registeredFactories: factories.size,
      executedFactories: [...loaded].map((id) => {
        const { path, hash, chunkHash } = factories.get(id);
        return { id, path, factoryHash: hash, chunkHash };
      }),
      deniedImports: [...blocked],
    };
  }
  return {
    side,
    factories,
    exportsFor,
    capturesFor,
    bind,
    setJSON,
    evaluate,
    evidence,
  };
}
