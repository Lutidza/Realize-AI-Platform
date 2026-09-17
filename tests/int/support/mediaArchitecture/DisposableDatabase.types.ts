/**
 * @file tests/int/support/mediaArchitecture/DisposableDatabase.types.ts
 * @version 1.0.0
 * @date 2026-09-14
 * @description Контракты принадлежащей одному запуску PostgreSQL-базы прототипа Media.
 * @see documentation/specifications/media-management.md
 */

/** Строки подключения содержат учётные данные и используются только в памяти теста. */
export type DisposableDatabaseConnection = {
  connectionString: string;
  databaseName: string;
  maintenanceConnectionString: string;
  maintenanceDatabaseName: string;
  workingDatabaseName: string;
};

/** Закрывает только созданную этим экземпляром базу; сначала потребитель останавливает Payload. */
export type DisposableDatabase = {
  readonly connectionString: string;
  readonly databaseName: string;
  dispose: () => Promise<void>;
};
