/**
 * @file tests/e2e/support/accessCliAcceptance.types.ts
 * @version 1.0.0
 * @date 2026-10-19
 * @description Задаёт изолированную приёмку CLI через callback явного browser подтверждения.
 * @see documentation/architecture/platform-access.md
 */
export type AccessCliAcceptanceOptions = {
  /** URL отдельного fixture server с выделенным для текущего run портом. */
  baseURL: string;
  /** Только nonsecret fixture evidence; credential runtime создаётся отдельно в os.tmpdir(). */
  temporaryDirectory: string;
  approve: (userCode: string) => Promise<void>;
};
export type AccessCliAcceptanceResult = {
  login: "authenticated";
  status: "authenticated";
  projects: "completed";
  logout: "logged_out";
  remoteRevoked: true;
};
