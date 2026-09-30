/**
 * @file tests/int/designWorkspaceChild.fixture.ts
 * @version 1.0.0
 * @date 2026-09-25
 * @description Приостанавливает настоящий materializer на durable checkpoint для проверки аварийного рестарта.
 * @see documentation/specifications/design-workshop.md
 */
import { readFile } from "node:fs/promises";
import { DesignWorkspace } from "../../services/ai-execution-worker/src/design-workshop/DesignWorkspace.service";

const [configurationFile] = process.argv.slice(2);
const configuration = JSON.parse(await readFile(configurationFile, "utf8"));
const service = new DesignWorkspace({
  repositoryRoot: configuration.repositoryRoot,
  storageRoot: configuration.storageRoot,
  onCheckpoint: async ({ phase }) => {
    if (phase === configuration.stopAt) {
      process.send?.({ phase });
      await new Promise<void>(() => {
        setInterval(() => undefined, 1000);
      });
    }
  },
});
try {
  const receipt = await service.materialize(configuration.source);
  process.send?.({ receipt });
} catch {
  process.send?.({ error: "MATERIALIZATION_FAILED" });
  process.exitCode = 1;
}
