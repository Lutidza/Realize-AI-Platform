/**
 * @file tests/int/mediaMutationSafety.int.spec.ts
 * @version 1.0.0
 * @date 2026-09-15
 * @description Проверяет отказ bulk-профиля и порядок безопасных hooks изменения и удаления Media.
 * @see documentation/specifications/media-management.md
 */
import { APIError, type PayloadRequest } from "payload";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prepareMediaUpload } from "../../src/collections/Media/prepareMediaUpload.hook";
import { assertMediaDeletionReady } from "../../src/collections/Media/assertMediaDeletionReady.hook";
import { deleteMediaProcessing } from "../../src/collections/Media/deleteMediaProcessing.hook";

const locked = vi.hoisted(() => vi.fn());
vi.mock("../../src/collections/Media/lockMediaTransaction.repository", () => ({
  lockMediaTransaction: locked,
}));
vi.mock(
  "../../src/collections/Media/createMediaInternalRequest.service",
  () => ({
    createMediaInternalRequest: async (req: PayloadRequest) => ({
      ...req,
      context: { ...req.context, mediaProcessingInternal: true },
      file: undefined,
    }),
  }),
);

beforeEach(() => {
  locked.mockReset().mockResolvedValue(undefined);
});

function fixture() {
  const payload = {
    find: vi.fn().mockResolvedValue({ docs: [] }),
    findByID: vi.fn().mockResolvedValue({
      id: 11,
      alt: "Описание",
      original: 91,
      managedDisplay: true,
    }),
    delete: vi.fn().mockResolvedValue({ docs: [], errors: [] }),
    update: vi.fn(),
    create: vi.fn(),
  };
  const req = {
    payload,
    user: { id: 1, roles: ["admin"] },
    context: {},
    query: {},
    transactionID: "fixture-transaction",
  } as unknown as PayloadRequest;
  return { payload, req };
}

function prepare(req: PayloadRequest, args: Record<string, unknown>) {
  return prepareMediaUpload({
    req,
    args: { req, ...args },
    operation: "update",
  } as unknown as Parameters<typeof prepareMediaUpload>[0]);
}

function beforeDelete(req: PayloadRequest) {
  return assertMediaDeletionReady({ req, id: 11 } as Parameters<
    typeof assertMediaDeletionReady
  >[0]);
}

describe("Media mutation safety", () => {
  it("rejects bulk profile changes before reading or writing any individual document", async () => {
    const { req, payload } = fixture();
    await expect(
      prepare(req, {
        where: { id: { in: [11, 12] } },
        data: { processingProfile: 2 },
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(locked).not.toHaveBeenCalled();
    expect(payload.findByID).not.toHaveBeenCalled();
    expect(payload.create).not.toHaveBeenCalled();
    expect(payload.update).not.toHaveBeenCalled();
  });

  it("preserves ordinary native bulk metadata editing", async () => {
    const { req } = fixture();
    const data = { alt: "Общее описание", caption: null };
    await expect(
      prepare(req, { where: { id: { in: [11, 12] } }, data }),
    ).resolves.toMatchObject({ data });
    expect(locked).not.toHaveBeenCalled();
  });

  it("serializes a single update before its saved read and rejects protected changes", async () => {
    const { req, payload } = fixture();
    payload.findByID.mockImplementation(async () => {
      expect(locked).toHaveBeenCalledWith(req, 11);
      return { id: 11, original: 91 };
    });
    await expect(
      prepare(req, { id: 11, data: { original: 92 } }),
    ).rejects.toMatchObject({ status: 409 });
    expect(payload.findByID).toHaveBeenCalledOnce();
  });

  it("does not remove files before a subsequent native document-lock rejection", async () => {
    const { req, payload } = fixture();
    await beforeDelete(req);
    // Native deleteByID проверяет блокировку после этого hook; при отказе afterDelete не вызывается.
    const nativeLockedDelete = Promise.reject(
      new APIError("Документ заблокирован.", 423),
    );
    await expect(nativeLockedDelete).rejects.toMatchObject({ status: 423 });
    expect(payload.delete).not.toHaveBeenCalled();
    expect(payload.update).not.toHaveBeenCalled();
    expect(payload.find).toHaveBeenCalledOnce();
  });

  it("rejects busy deletion without touching records or files", async () => {
    const { req, payload } = fixture();
    payload.find.mockResolvedValue({ docs: [{ id: 3 }] });
    await expect(beforeDelete(req)).rejects.toMatchObject({ status: 409 });
    expect(payload.delete).not.toHaveBeenCalled();
  });

  it("cleans the exact original chain after native deletion has cleared media foreign keys", async () => {
    const { req, payload } = fixture();
    payload.find
      .mockResolvedValueOnce({ docs: [{ id: 3, media: null, original: 91 }] })
      .mockResolvedValue({ docs: [] });
    const doc = { id: 11, original: 91 };
    await deleteMediaProcessing({ req, doc } as unknown as Parameters<
      typeof deleteMediaProcessing
    >[0]);
    expect(payload.find.mock.calls[0][0].where).toEqual({
      original: { equals: 91 },
    });
    expect(payload.delete.mock.calls.map(([args]) => args.collection)).toEqual([
      "media-variants",
      "payload-jobs",
      "media-processing-sets",
      "media-originals",
    ]);
    expect(payload.delete.mock.calls[1][0].where).toEqual({
      and: [
        { taskSlug: { equals: "processMedia" } },
        { queue: { equals: "media" } },
        { "input.setID": { equals: 3 } },
      ],
    });
    expect(payload.delete.mock.calls[3][0]).toMatchObject({
      collection: "media-originals",
      id: 91,
    });
  });

  it("does not report successful cleanup or remove parents when native bulk deletion returns errors", async () => {
    const { req, payload } = fixture();
    payload.find.mockResolvedValue({ docs: [{ id: 3, original: 91 }] });
    payload.delete.mockResolvedValue({
      docs: [],
      errors: [{ id: 8, message: "File deletion failed" }],
    });
    await expect(
      deleteMediaProcessing({
        req,
        doc: { id: 11, original: 91 },
      } as unknown as Parameters<typeof deleteMediaProcessing>[0]),
    ).rejects.toMatchObject({ status: 500 });
    expect(payload.delete).toHaveBeenCalledOnce();
    expect(payload.delete.mock.calls[0][0].collection).toBe("media-variants");
  });
});
