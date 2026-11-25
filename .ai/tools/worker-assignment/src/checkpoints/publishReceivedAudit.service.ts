/**
 * @file .ai/tools/worker-assignment/src/checkpoints/publishReceivedAudit.service.ts
 * @version 1.0.0
 * @date 2026-11-25
 * @description Передаёт владельцу досье подтверждённый отчёт и разрешённые версии источников аудита.
 * @see documentation/specifications/task-management/execution/article-audit-publication.md
 */
import type {
  AuditDossierRepository,
  AuditPublication,
} from "@realize/payload-task-manager/audit-review";
import type { RepositoryReadPolicy } from "../../../../../services/ai-control-plane/src/RepositoryRead.types";
import { readRepositoryFile } from "../../../../../services/ai-control-plane/src/readRepositoryFile.service";
import { bindAssignment } from "../bindAssignment.service";
import type { PostgresCheckpointStore } from "./PostgresCheckpoint.repository";
import { hashAuditText } from "./hashAuditText.util";
import { prepareAuditHandoff } from "./prepareAuditHandoff.service";

/** Аргументы маршрутизации и состав материалов выводятся из закрытого снимка владельца попытки. */
export async function publishReceivedAudit(
  store: PostgresCheckpointStore,
  dossier: Pick<AuditDossierRepository, "publish">,
  attemptId: string,
  policy: RepositoryReadPolicy,
) {
  const snapshot = await store.get(attemptId);
  const handoff = prepareAuditHandoff(
    snapshot,
    await store.receipts(attemptId),
  );
  const identity = snapshot.state.identity;
  const { contextId, lockPath } = identity.selection;
  const bound = await bindAssignment(policy, lockPath, contextId);
  if (
    !bound.context ||
    bound.report.lockSha256 !== identity.lockSha256 ||
    bound.report.assignmentId !== identity.assignmentId ||
    bound.report.revision !== identity.revision ||
    hashAuditText(bound.context.initialInput) !== identity.inputSha256
  )
    throw new Error("audit_publication_context_mismatch");
  const sources: AuditPublication["sources"] = [];
  // Сервер читает только разрешённые pins. Путь из замечания аудитора не может расширить архив.
  for (const [path, sha256] of Object.entries(bound.context.readPins)) {
    const file = await readRepositoryFile(policy, path);
    if (file.sha256 !== sha256) throw new Error("audit_source_mismatch");
    sources.push({ path, sha256, bytes: file.bytes });
  }
  return dossier.publish({ ...handoff, sources });
}
