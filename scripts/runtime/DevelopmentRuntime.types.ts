/**
 * @file scripts/runtime/DevelopmentRuntime.types.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Описывает дочерние процессы и границы совместного запуска разработки.
 */

/** Исполнитель завершается после текущего задания; остальные сервисы — всей группой. */
export type DevelopmentProcess = {
  name: "web" | "control-plane" | "execution-worker";
  args: string[];
  drain?: boolean;
  readyUrl?: string;
};

export type DevelopmentRuntime = {
  cwd: string;
  environment: NodeJS.ProcessEnv;
  local: boolean;
  processes: DevelopmentProcess[];
  ports: { name: string; host: string; port: number }[];
};

export type DevelopmentSupervisorOptions = {
  runtime: DevelopmentRuntime;
  signal: AbortSignal;
  log?: (message: string) => void;
};

/** Ресурс процесса принадлежит только запустившему его supervisor. */
export type SupervisedDevelopmentProcess = {
  stop: () => void;
  done: Promise<void>;
};
