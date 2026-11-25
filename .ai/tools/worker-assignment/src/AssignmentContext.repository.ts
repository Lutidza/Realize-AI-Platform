/**
 * @file .ai/tools/worker-assignment/src/AssignmentContext.repository.ts
 * @version 1.0.0
 * @date 2026-11-25
 * @description Создаёт личный файл контекста атомарно и читает его по идентификатору.
 */
import { PrivateJsonRepository } from "@realize/verification-runtime";
import { z } from "zod";

export class AssignmentContextRepository {
  private readonly file: PrivateJsonRepository;

  constructor(root: string, contextId: string) {
    if (!z.uuidv4().safeParse(contextId).success)
      throw new Error("Некорректный contextId.");
    this.file = new PrivateJsonRepository({
      root,
      relativePath: `.ai/tools/worker-assignment/runtime/contexts/${contextId}.json`,
    });
  }

  /** Одна привязка создаёт новый контекст; существующий нельзя заменить через этот API. */
  async create(record: unknown) {
    if (!(await this.file.saveIfAbsent(record)))
      throw new Error("Контекст уже существует.");
  }

  load() {
    return this.file.load();
  }
}
