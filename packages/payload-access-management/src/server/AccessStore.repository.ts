/**
 * @file packages/payload-access-management/src/server/AccessStore.repository.ts
 * @version 1.0.0
 * @date 2026-10-19
 * @description Изолирует внутренние Payload операции и выдаёт только rows доверенному access service.
 * @see documentation/architecture/platform-access.md
 */
import type {
  CollectionSlug,
  PayloadRequest,
  RequiredDataFromCollectionSlug,
  Where,
} from "payload";
import { ACCESS_STORAGE_CONTEXT } from "../accessManagement.constants";
import type {
  AccessStorageRow,
  AccessStorageSlug,
} from "./AccessStorage.types";
/** Контекст доверия устанавливается на отдельную операцию и не разрешает другие HTTP endpoints. */
export class AccessStoreRepository {
  constructor(private readonly req: PayloadRequest) {}
  private get context() {
    return { [ACCESS_STORAGE_CONTEXT]: true };
  }
  async create(
    collection: AccessStorageSlug,
    data: Record<string, unknown>,
  ): Promise<AccessStorageRow> {
    return (await this.req.payload.create({
      collection: collection as CollectionSlug,
      data: data as RequiredDataFromCollectionSlug<CollectionSlug>,
      req: this.req,
      context: this.context,
      depth: 0,
      overrideAccess: true,
    })) as unknown as AccessStorageRow;
  }
  async update(
    collection: AccessStorageSlug,
    id: string | number,
    data: Record<string, unknown>,
  ): Promise<void> {
    await this.req.payload.update({
      collection: collection as CollectionSlug,
      id,
      data,
      req: this.req,
      context: this.context,
      depth: 0,
      overrideAccess: true,
    });
  }
  async one(
    collection: AccessStorageSlug,
    where: Where,
  ): Promise<AccessStorageRow | null> {
    return (await this.rows(collection, where, 1))[0] ?? null;
  }
  async rows(
    collection: AccessStorageSlug,
    where: Where,
    limit: number,
    sort = "id",
  ): Promise<AccessStorageRow[]> {
    const result = await this.req.payload.find({
      collection: collection as CollectionSlug,
      where,
      limit,
      sort,
      depth: 0,
      req: this.req,
      context: this.context,
      overrideAccess: true,
    });
    return result.docs as unknown as AccessStorageRow[];
  }
  async count(collection: AccessStorageSlug, where: Where): Promise<number> {
    return (
      await this.req.payload.count({
        collection: collection as CollectionSlug,
        where,
        req: this.req,
        context: this.context,
        overrideAccess: true,
      })
    ).totalDocs;
  }
  async deleteExpired(
    collection: AccessStorageSlug,
    before: string,
  ): Promise<void> {
    await this.req.payload.delete({
      collection: collection as CollectionSlug,
      where: { expiresAt: { less_than: before } },
      req: this.req,
      context: this.context,
      overrideAccess: true,
    });
  }
}
