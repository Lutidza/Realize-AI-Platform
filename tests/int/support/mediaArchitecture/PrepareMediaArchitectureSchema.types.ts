/**
 * @file tests/int/support/mediaArchitecture/PrepareMediaArchitectureSchema.types.ts
 * @version 1.0.0
 * @date 2026-09-14
 * @description Контракт isolated generated миграции схемы прототипа Media.
 */

import type { MediaArchitectureConfigOptions } from "./MediaArchitecture.types";

/** Рабочий адрес нужен только для проверки, что миграция направлена в другую собственную базу. */
export type PrepareMediaArchitectureSchemaOptions =
  MediaArchitectureConfigOptions & {
    workingConnectionString: string;
  };

/** В IPC передаются только фиксированные этапы, без конфигурации и строк подключения. */
export type MediaArchitectureSchemaStage =
  | "validating"
  | "configuring"
  | "initializing"
  | "generating"
  | "connecting"
  | "migrating"
  | "destroying"
  | "complete";
