/**
 * @file .ai/tools/engineering/test/projectConfigMove.fixture.ts
 * @version 1.0.0
 * @date 2026-10-30
 * @description Готовит explicit projects с inherited selectors и транзитивным consumer поверх native move fixture.
 * @see documentation/architecture/engineering-operations.md
 */
import type { LoadEngineeringNativeInput } from "@realize/engineering-runtime";
import { aliasMoveFixture } from "./aliasMove.fixture.ts";

export const projectConfigs = ["config/build.json", "config/test.json"];
export function projectConfigMoveFixture(
  native: LoadEngineeringNativeInput,
  root?: string,
) {
  const f = aliasMoveFixture(native, root, true, false, projectConfigs);
  if (!root) {
    f.put(
      "tsconfig.json",
      '\uFEFF{\r\n  // Один paths owner всех проектов.\r\n  "compilerOptions": { "baseUrl": ".", "moduleResolution": "bundler", "paths": { "@total": ["./src/math/calculateTotal.util"], "@unused": ["src/math/calculateTotal.util.js"], "@app/*": ["src/*"] } },\r\n  "include": ["src/**/*"]\r\n}\r\n',
    );
    f.put(
      "config/selectors.json",
      '{"extends":"../tsconfig","include":["../src/**/*"],"exclude":["../src/ignored/**/*"]}',
    );
    f.put(
      projectConfigs[0],
      '{"extends":"./selectors","compilerOptions":{"strict":true}}',
    );
    f.put(
      projectConfigs[1],
      '{"extends":"../tsconfig","files":["../src/useTotal.util.ts"],"include":[],"exclude":["../src/math/**/*"]}',
    );
    f.utility(
      f.consumer,
      'import { calculateTotal } from "@total";\nexport function useTotal() { return calculateTotal(); }',
    );
    f.utility(
      f.relativeConsumer,
      'export { calculateTotal } from "./math/calculateTotal.util";\nexport function readTotal() { return 0; }',
    );
    f.utility(
      "src/roundPrice.util.ts",
      "export function roundPrice() { return 42; }",
    );
    f.utility(
      f.from,
      'import { roundPrice } from "@app/roundPrice.util";\nexport function calculateTotal() { return roundPrice(); }',
    );
  }
  return f;
}
