/**
 * @file tests/int/designWorkspace.fixture.ts
 * @version 1.0.0
 * @date 2026-09-25
 * @description Создаёт независимую revision с настоящими canonical hashes для filesystem проверок.
 * @see documentation/specifications/design-workshop.md
 */
import { randomUUID } from "node:crypto";
import type { DesignWorkspaceSource } from "@realize/ai-contracts";
import {
  hashCanonicalJSON,
  normalizeDesignSnapshot,
} from "@realize/change-engine";

export function designWorkspaceFixture(): DesignWorkspaceSource {
  const snapshot = normalizeDesignSnapshot({
    schemaVersion: "1.0",
    brief: {
      goal: "Макет задач",
      audience: "Команда",
      screens: [],
      states: [],
      constraints: [],
      acceptanceCriteria: ["Проверить версии"],
    },
    sources: [],
    files: [
      {
        path: "src/TaskView.tsx",
        content: "export const TaskView = () => <main>Задачи</main>;\n",
      },
      { path: "src/styles/task.css", content: "main { padding: 24px; }\n" },
      {
        path: "public/empty.svg",
        content: '<svg xmlns="http://www.w3.org/2000/svg"/>',
      },
    ],
  });
  return {
    pin: {
      schemaVersion: "1.0",
      bindingId: randomUUID(),
      projectId: randomUUID(),
      revision: {
        revisionId: randomUUID(),
        number: 1,
        contentHash: hashCanonicalJSON(snapshot),
      },
    },
    snapshot,
  };
}
