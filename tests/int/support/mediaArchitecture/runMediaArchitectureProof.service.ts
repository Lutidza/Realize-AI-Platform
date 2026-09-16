/**
 * @file tests/int/support/mediaArchitecture/runMediaArchitectureProof.service.ts
 * @version 1.0.0
 * @date 2026-09-14
 * @description Проверяет native upload/ACL/Jobs на одном исходнике и двух версиях рецепта.
 */
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import {
  commitTransaction,
  createLocalReq,
  handleEndpoints,
  initTransaction,
  killTransaction,
} from "payload";
import sharp from "sharp";
import {
  mediaArchitectureAPI,
  mediaArchitectureJobs,
} from "./mediaArchitecture.adapter";
import type {
  MediaArchitectureProofOptions,
  MediaArchitectureProofResult,
  MediaArchitectureReadySet,
  MediaProofDocument,
} from "./MediaArchitecture.types";
import type { MediaRecipe } from "../../../../src/collections/Media/MediaProcessing.types";

const hash = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");
const document = (value: unknown): MediaProofDocument => {
  assert(
    value &&
      typeof value === "object" &&
      "id" in value &&
      (typeof value.id === "number" || typeof value.id === "string"),
  );
  return value as MediaProofDocument;
};
const string = (value: unknown) => {
  assert.equal(typeof value, "string");
  return value as string;
};
const number = (value: unknown) => {
  assert.equal(typeof value, "number");
  return value as number;
};

/** Не создаёт/удаляет БД и не открывает сервер: lifecycle принадлежит вызывающему proof. */
export const runMediaArchitectureProof = async ({
  payload,
  config,
  key,
  storageRoot,
}: MediaArchitectureProofOptions): Promise<MediaArchitectureProofResult> => {
  const started = performance.now();
  const cpuStarted = process.cpuUsage();
  const api = mediaArchitectureAPI(payload);
  const jobs = mediaArchitectureJobs(payload);
  const passwords = randomBytes(24).toString("hex");
  const user = await payload.create({
    collection: "users",
    data: { email: "media-proof@example.invalid", password: passwords },
    overrideAccess: true,
  });
  const login = await payload.login({
    collection: "users",
    data: { email: user.email, password: passwords },
  });
  assert(login.token);
  const actor = { ...user, collection: "users" as const };
  const request = (
    method: string,
    route: string,
    body?: BodyInit,
    authenticated = true,
    headers: Record<string, string> = {},
  ) =>
    handleEndpoints({
      config,
      payloadInstanceCacheKey: key,
      request: new Request(`http://media-proof.invalid${route}`, {
        method,
        body,
        headers: {
          ...headers,
          ...(authenticated ? { Authorization: `JWT ${login.token}` } : {}),
        },
      }),
    });
  const bytes = Buffer.alloc(2400 * 1600 * 3);
  for (let index = 0; index < bytes.length; index++)
    bytes[index] = (index * 13 + Math.floor(index / 180)) % 256;
  const source = await sharp(bytes, {
    raw: { width: 2400, height: 1600, channels: 3 },
  })
    .jpeg({ quality: 92 })
    .withMetadata({ orientation: 6 })
    .toBuffer();
  const sourceHash = hash(source);
  assert.equal((await sharp(source).metadata()).orientation, 6);
  const upload = (name: string, file: Buffer) => {
    const form = new FormData();
    form.set(
      "_payload",
      JSON.stringify({ alt: "Architecture proof original" }),
    );
    form.set(
      "file",
      new Blob([new Uint8Array(file)], { type: "image/jpeg" }),
      name,
    );
    return form;
  };
  const uploadResponse = await request(
    "POST",
    "/api/proof-originals",
    upload("original.jpg", source),
  );
  assert.equal(uploadResponse.status, 201);
  const uploadData: unknown = await uploadResponse.json();
  assert(uploadData && typeof uploadData === "object" && "doc" in uploadData);
  const original = document(uploadData.doc);
  const filename = string(original.filename);
  assert.equal(path.basename(filename), filename);
  const originalRoute = `/api/proof-originals/file/${encodeURIComponent(filename)}`;
  const privateResponse = await request("GET", originalRoute);
  assert.equal(privateResponse.status, 200);
  assert.match(
    privateResponse.headers.get("cache-control") ?? "",
    /private.*no-store/,
  );
  assert.equal(
    hash(Buffer.from(await privateResponse.arrayBuffer())),
    sourceHash,
  );
  const anonymous = await request("GET", originalRoute, undefined, false);
  assert.equal(anonymous.status, 403);
  assert(!Buffer.from(await anonymous.arrayBuffer()).equals(source));
  const update = (data: unknown, query = "") =>
    request(
      "PATCH",
      `/api/proof-originals/${original.id}${query}`,
      JSON.stringify(data),
      true,
      { "Content-Type": "application/json" },
    );
  assert.equal(
    (await update({ alt: "Metadata remains editable" })).status,
    200,
  );
  assert.equal(
    (
      await update(
        { alt: "crop attack" },
        "?uploadEdits[crop][x]=1&uploadEdits[crop][y]=1&uploadEdits[crop][width]=20&uploadEdits[crop][height]=20",
      )
    ).status,
    409,
  );
  assert.equal((await update({ focalX: 0, focalY: 50 })).status, 409);
  assert.equal((await update({ crop: { x: 1 } })).status, 409);
  assert.equal(
    (
      await request(
        "PATCH",
        `/api/proof-originals/${original.id}`,
        upload("replacement.jpg", source),
      )
    ).status,
    409,
  );
  const incomingCrop = upload("inline.jpg", source);
  incomingCrop.set(
    "_payload",
    JSON.stringify({ alt: "blocked", focalX: 0, focalY: 50 }),
  );
  assert.equal(
    (await request("POST", "/api/proof-originals", incomingCrop)).status,
    409,
  );
  assert.equal(
    (
      await request(
        "POST",
        "/api/proof-originals?uploadEdits[crop][x]=1",
        upload("query.jpg", source),
      )
    ).status,
    409,
  );
  assert.equal(
    hash(await readFile(path.join(storageRoot, "originals", filename))),
    sourceHash,
  );
  assert.deepEqual(await readdir(path.join(storageRoot, "originals")), [
    filename,
  ]);
  await assert.rejects(
    async () =>
      api.create({
        collection: "proof-originals",
        data: { alt: "Overwrite attempt" },
        req: await createLocalReq({ user: actor }, payload),
        overrideAccess: false,
        overwriteExistingFiles: true,
        file: {
          data: source,
          mimetype: "image/jpeg",
          name: filename,
          size: source.length,
        },
      }),
    /Перезапись существующего файла запрещена/,
  );

  const recipeOne: MediaRecipe = {
    profile: "content",
    version: 1,
    variants: [
      { slot: "small", width: 320, format: "webp", quality: 70 },
      { slot: "medium", width: 640, format: "webp", quality: 70 },
      { slot: "medium", width: 640, format: "jpeg", quality: 78 },
    ],
  };
  const recipeTwo: MediaRecipe = {
    ...recipeOne,
    version: 2,
    variants: [
      { slot: "small", width: 320, format: "webp", quality: 85 },
      { slot: "medium", width: 640, format: "webp", quality: 85 },
      { slot: "medium", width: 640, format: "jpeg", quality: 88 },
    ],
  };
  const recipes = [recipeOne, recipeTwo];
  const uploadConfigs = JSON.stringify(
    Object.fromEntries(
      Object.entries(payload.collections)
        .filter(([slug]) => slug.startsWith("proof-"))
        .map(([slug, collection]) => [slug, collection.config.upload]),
    ),
  );
  const enqueue = async (
    recipe: MediaRecipe,
    rollback = false,
    failOnce = false,
  ) => {
    const req = await createLocalReq({ user: actor }, payload);
    assert.equal(await initTransaction(req), true);
    try {
      const intent = await api.create({
        collection: "proof-intents",
        data: { originalID: Number(original.id), sourceHash, recipe, failOnce },
        req,
        overrideAccess: false,
      });
      const job = await jobs.queue({
        task: "mediaArchitectureProcess",
        input: { intentID: String(intent.id) },
        queue: "media-proof",
        req,
        overrideAccess: false,
      });
      if (rollback) await killTransaction(req);
      else await commitTransaction(req);
      return { intent, job };
    } catch (error) {
      await killTransaction(req);
      throw error;
    }
  };
  const rolledBack = await enqueue(recipeOne, true);
  const req = await createLocalReq({ user: actor }, payload);
  assert.equal(
    (
      await api.find({
        collection: "proof-intents",
        req,
        overrideAccess: false,
        depth: 0,
        limit: 5,
      })
    ).totalDocs,
    0,
  );
  assert.equal(
    (
      await api.find({
        collection: "payload-jobs",
        req,
        overrideAccess: false,
        depth: 0,
        limit: 5,
      })
    ).totalDocs,
    0,
  );
  assert(rolledBack.job.id);
  const first = await enqueue(recipeOne, false, true);
  const run = async () =>
    payload.jobs.run({
      queue: "media-proof",
      limit: 1,
      sequential: true,
      req: await createLocalReq({ user: actor }, payload),
      overrideAccess: false,
      silent: true,
    });
  await run();
  const afterFailure = await api.findByID({
    collection: "proof-intents",
    id: first.intent.id,
    req,
    overrideAccess: false,
    depth: 0,
  });
  assert.equal(afterFailure.failedOnce, true);
  assert.equal(afterFailure.status, "pending");
  const beforeRetry = await api.find({
    collection: "proof-variants",
    req,
    overrideAccess: false,
    depth: 0,
    limit: 16,
  });
  assert.equal(beforeRetry.totalDocs, 3);
  await run();
  const afterRetry = await api.find({
    collection: "proof-variants",
    req,
    overrideAccess: false,
    depth: 0,
    limit: 16,
  });
  assert.deepEqual(
    afterRetry.docs.map((doc) => [doc.id, doc.url, doc.filename]),
    beforeRetry.docs.map((doc) => [doc.id, doc.url, doc.filename]),
  );
  const firstReady = await api.findByID({
    collection: "proof-intents",
    id: first.intent.id,
    req,
    overrideAccess: false,
    depth: 0,
  });
  assert.equal(firstReady.status, "ready");
  const second = await enqueue(recipeTwo);
  await run();
  const secondReady = await api.findByID({
    collection: "proof-intents",
    id: second.intent.id,
    req,
    overrideAccess: false,
    depth: 0,
  });
  assert.equal(secondReady.status, "ready");
  assert.notEqual(firstReady.variantSetID, secondReady.variantSetID);
  await run();
  const variants = await api.find({
    collection: "proof-variants",
    req,
    overrideAccess: false,
    depth: 0,
    limit: 16,
  });
  assert.equal(variants.totalDocs, 6);
  const readySets: MediaArchitectureReadySet[] = [];
  for (const intent of [firstReady, secondReady]) {
    const docs = variants.docs.filter(
      (doc) => doc.variantSetID === intent.variantSetID,
    );
    assert.equal(docs.length, 3);
    const readyVariants: MediaArchitectureReadySet["variants"] = [];
    for (const doc of docs) {
      const response = await request(
        "GET",
        `/api/proof-variants/file/${encodeURIComponent(string(doc.filename))}`,
        undefined,
        false,
      );
      assert.equal(response.status, 200);
      const file = Buffer.from(await response.arrayBuffer());
      assert.equal(hash(file), doc.contentHash);
      const metadata = await sharp(file).metadata();
      assert.equal(metadata.width, doc.width);
      assert.equal(metadata.height, doc.height);
      assert.equal(metadata.exif, undefined);
      assert.equal(metadata.orientation, undefined);
      assert.equal(file.length, doc.filesize);
      assert(
        doc.format === "webp" || doc.format === "jpeg" || doc.format === "png",
      );
      readyVariants.push({
        slot: string(doc.slot),
        format: doc.format,
        filename: string(doc.filename),
        url: string(doc.url),
        width: number(doc.width),
        height: number(doc.height),
        mimeType: string(doc.mimeType),
        byteLength: number(doc.filesize),
        contentHash: string(doc.contentHash),
      });
    }
    readySets.push({
      sourceHash,
      recipeHash: string(docs[0].recipeHash),
      variantSetID: string(intent.variantSetID),
      pipelineVersion: string(docs[0].pipelineVersion),
      variants: readyVariants,
    });
  }
  assert.equal(
    hash(await readFile(path.join(storageRoot, "originals", filename))),
    sourceHash,
  );
  assert.equal(
    JSON.stringify(
      Object.fromEntries(
        Object.entries(payload.collections)
          .filter(([slug]) => slug.startsWith("proof-"))
          .map(([slug, collection]) => [slug, collection.config.upload]),
      ),
    ),
    uploadConfigs,
  );
  const cpu = process.cpuUsage(cpuStarted);
  return {
    status: "passed",
    sourceHash,
    recipes,
    readySets,
    checks: {
      nativeUpload: true,
      sourceExifPreserved: true,
      nativePrivateACL: true,
      cropAndReplacementRejected: true,
      metadataUpdate: true,
      originalUnchanged: true,
      transactionQueueRollback: true,
      retryAfterFileWrite: true,
      stableRetryURLs: true,
      completedReplayNoop: true,
      previousVariantsUnchanged: true,
      unchangedUploadConfig: true,
      variantCount: 6,
    },
    metrics: {
      elapsedMs: performance.now() - started,
      cpuUserMs: cpu.user / 1000,
      cpuSystemMs: cpu.system / 1000,
      maxRSSKiB: process.resourceUsage().maxRSS,
    },
  };
};
