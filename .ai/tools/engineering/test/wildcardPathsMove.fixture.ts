/**
 * @file .ai/tools/engineering/test/wildcardPathsMove.fixture.ts
 * @version 1.0.0
 * @date 2026-10-30
 * @description Готовит целый wildcard target с вложенным root, несколькими configs и unchanged alias consumers.
 * @see documentation/architecture/engineering-operations.md
 */
import { posix } from "node:path";
import type { LoadEngineeringNativeInput } from "@realize/engineering-runtime";
import { aliasMoveFixture } from "./aliasMove.fixture.ts";

const projectConfigs = ["config/build.json", "config/test.json"];
export function wildcardPathsMoveFixture(
  native: LoadEngineeringNativeInput,
  root?: string,
  shared = true,
  inherited = true,
) {
  const configOwner = inherited ? "config/paths.json" : "tsconfig.json";
  const f = aliasMoveFixture(native, root, configOwner, shared, projectConfigs);
  const sourceDirectory = posix.dirname(f.from),
    targetDirectory = posix.dirname(f.to) + "/math";
  const sourceRoot = shared ? "src/lib/code" : "src";
  const consumerRoot = posix.dirname(f.consumer);
  const members = [
    f.from,
    sourceDirectory + "/detail/roundPrice.util.ts",
    sourceDirectory + "/unusedTotal.util.ts",
  ];
  const aliasConsumers = [f.consumer, sourceRoot + "/keepTotal.util.ts"];
  const broadConsumer = consumerRoot + "/useBroadTotal.util.ts";
  const nearestConfigs = shared
    ? [
        "src/lib/tsconfig.json",
        "src/app-a/tsconfig.json",
        "src/app-b/tsconfig.json",
      ]
    : ["tsconfig.json"];
  const readonlyConfigs = [
    ...new Set([
      ...projectConfigs,
      ...(inherited
        ? [...nearestConfigs, "tsconfig.json", "config/options.json"]
        : []),
    ]),
  ];
  if (!root) {
    const paths = {
      "@domain/*": ["./" + sourceDirectory + "/*"],
      "@nested/*": [sourceDirectory + "/detail/*"],
      "@unused/*": [sourceDirectory + "/*"],
      "@exact": [sourceDirectory + "/calculateTotal.util"],
      "@app/*": ["src/*"],
    };
    const config = {
      compilerOptions: {
        ...(inherited ? {} : { baseUrl: ".", moduleResolution: "bundler" }),
        paths,
      },
      ...(inherited ? { extends: "./options" } : { include: ["src/**/*"] }),
    };
    f.put(
      configOwner,
      "\uFEFF// Сохраняем комментарий и CRLF.\r\n" +
        JSON.stringify(config, null, 2).replaceAll("\n", "\r\n") +
        "\r\n",
    );
    if (inherited) {
      f.put(
        "config/options.json",
        '{"compilerOptions":{"baseUrl":"..","moduleResolution":"bundler"}}',
      );
      f.put(
        "tsconfig.json",
        '{"extends":"./config/paths","include":["src/**/*"]}',
      );
    }
    if (shared)
      for (const path of nearestConfigs)
        f.put(
          path,
          JSON.stringify({
            extends: "../../config/paths",
            compilerOptions: {
              baseUrl: path.includes("app-b") ? "../.././" : "../..",
            },
            include: ["code/**/*"],
          }),
        );
    f.put(
      projectConfigs[0],
      '{"extends":"../tsconfig","include":["../src/**/*"]}',
    );
    f.put(
      projectConfigs[1],
      JSON.stringify({
        extends: "../tsconfig",
        files: ["../" + f.consumer],
        include: [],
      }),
    );
    f.utility(
      members[0],
      'import { roundPrice } from "@nested/roundPrice.util";\nexport function calculateTotal() { return roundPrice(); }',
    );
    f.utility(members[1], "export function roundPrice() { return 42; }");
    f.utility(members[2], "export function unusedTotal() { return 1; }");
    f.utility(
      aliasConsumers[0],
      'import { calculateTotal } from "@domain/calculateTotal.util.js";\nexport function useTotal() { return calculateTotal(); }',
    );
    f.utility(
      aliasConsumers[1],
      'import { calculateTotal } from "@domain/calculateTotal.util";\nexport function keepTotal() { return calculateTotal(); }',
    );
    f.utility(
      broadConsumer,
      `import { calculateTotal } from "@app/${sourceDirectory.slice(4)}/calculateTotal.util";\nexport function useBroadTotal() { return calculateTotal(); }`,
    );
    let relative = posix.relative(
      posix.dirname(f.relativeConsumer),
      sourceDirectory + "/calculateTotal.util",
    );
    if (!relative.startsWith(".")) relative = "./" + relative;
    f.utility(
      f.relativeConsumer,
      `export { calculateTotal } from "${relative}";\nexport function readTotal() { return 0; }`,
    );
  }
  return {
    ...f,
    configOwner,
    sourceDirectory,
    targetDirectory,
    members,
    aliasConsumers,
    broadConsumer,
    readonlyConfigs,
    consumerConfigs: [...nearestConfigs, ...projectConfigs],
  };
}
