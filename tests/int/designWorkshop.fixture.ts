/**
 * @file tests/int/designWorkshop.fixture.ts
 * @version 1.0.0
 * @date 2026-09-25
 * @description Создаёт независимый текстовый макет для проверок контрактов и сохранения Мастерской.
 * @see documentation/specifications/design-workshop.md
 */
import type { CreateDesignProjectInput } from "@realize/ai-contracts";

export function designProjectFixture(): CreateDesignProjectInput {
  return {
    title: "Мастерская Task Manager",
    target: "admin",
    kind: "reference",
    snapshot: {
      schemaVersion: "1.0",
      brief: {
        goal: "Проверить структуру рабочего пространства",
        audience: "Администратор проекта",
        screens: ["Список задач"],
        states: ["Пустой список"],
        constraints: ["Русский интерфейс"],
        acceptanceCriteria: ["Фильтр и кнопка создания доступны с клавиатуры"],
      },
      sources: [
        {
          kind: "note",
          title: "Начальные условия",
          text: "Сохранить навигацию проекта.",
        },
      ],
      files: [
        {
          path: "src/TaskView.tsx",
          content: "export const TaskView = () => <main>Задачи</main>;\n",
        },
        { path: "src/task.css", content: "main { padding: 16px; }\n" },
      ],
    },
  };
}
