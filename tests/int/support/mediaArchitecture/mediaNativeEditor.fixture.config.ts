/**
 * @file tests/int/support/mediaArchitecture/mediaNativeEditor.fixture.config.ts
 * @version 1.0.0
 * @date 2026-09-14
 * @description Подключает CSS настоящего Payload editor для отдельного контрактного DOM proof.
 */
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: [
      "tests/int/support/mediaArchitecture/mediaNativeEditor.fixture.spec.ts",
    ],
    server: {
      deps: { inline: [/@payloadcms\/ui/, /react-image-crop/] },
    },
  },
});
