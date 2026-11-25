/**
 * @file .ai/tools/worker-assignment/src/admission/AssignmentAdmission.types.ts
 * @version 1.0.0
 * @date 2026-11-25
 * @description Описывает решение оркестратора и доверенные источники подтверждения.
 * @see documentation/architecture/assignment-adapter/contract.md
 */
import type { AdapterAccessEvidenceV1 } from "@realize/ai-contracts";
import type { AssignmentBindResult } from "../WorkerAssignment.types";

export type BoundAssignment = Extract<
  AssignmentBindResult,
  { context: object }
>;
export type AdmissionTarget = Omit<
  AdapterAccessEvidenceV1["executor"],
  "observedVersion"
>;
export type AccessBinding = NonNullable<AdapterAccessEvidenceV1["binding"]>;
export type ObservationRef = AdapterAccessEvidenceV1["observations"][number];
type Access = AdapterAccessEvidenceV1["access"];

/** Каталог, диспетчер и положительные/отрицательные пробы подтверждают разные факты. */
export type ObservationFacts = {
  "tool-catalog": Pick<Access, "coverage" | "routes" | "readPaths">;
  "dispatch-policy": Pick<
    Access,
    "routes" | "readPaths" | "writePaths" | "readsPinned"
  >;
  "read-probe": Pick<Access, "readPaths" | "readsPinned">;
  "denial-probe": Pick<Access, "outsideReadDenied" | "writeDenied">;
};

export type AdmissionAttempt = {
  attemptId: string;
  target: AdmissionTarget;
  bindingKind: AccessBinding["kind"];
};

/** Обе функции принадлежат выбранному доверенному адаптеру, вне сериализуемого сообщения. */
export interface AdmissionAuthority {
  resolve(
    attemptId: string,
    ref: ObservationRef,
  ): ObservationFacts[keyof ObservationFacts] | undefined;
  isCurrent(attemptId: string, binding: AccessBinding): boolean;
}

/** Локальный снимок адаптера API. Тело запроса и функция диспетчера остаются внутри Realize. */
export interface PreparedAuditApiRequest {
  readonly id: string;
  readonly attemptId: string;
  readonly providerId: string;
  readonly body: string;
  readonly dispatch: BoundAssignment["context"]["callTool"];
}

/** Сведения предоставляет выбранная интеграция. Неизвестная политика провайдера закрывает передачу. */
export interface AuditApiAdapter {
  readonly adapterId: string;
  readonly observedVersion: string | null;
  readonly toolPolicy: "explicit-functions-only" | "unknown";
  currentRequest(): PreparedAuditApiRequest | null;
}
