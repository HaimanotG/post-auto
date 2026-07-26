import type { ObjectStorage, UploadResult } from "@postauto/storage";
import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../app.js";
import { createFixturePrismaStore, FIXTURE_TOKEN_ENCRYPTION_KEY } from "../test-utils/fixture-prisma.js";

const FIXTURE_JWT_SECRET = "fixture-jwt-secret-for-uploads-tests";
const FIXTURE_BASE_URL = "https://api.fixture.test";
const BOUNDARY = "----postautoTestBoundary123456";

function buildMultipartPayload(params: { filename: string; contentType: string; data: Buffer }): Buffer {
  return Buffer.concat([
    Buffer.from(
      `--${BOUNDARY}\r\nContent-Disposition: form-data; name="file"; filename="${params.filename}"\r\nContent-Type: ${params.contentType}\r\n\r\n`,
    ),
    params.data,
    Buffer.from(`\r\n--${BOUNDARY}--\r\n`),
  ]);
}

function fakeObjectStorage(): { storage: ObjectStorage; upload: ReturnType<typeof vi.fn> } {
  const upload = vi.fn<(key: string, data: Buffer, contentType: string) => Promise<UploadResult>>().mockImplementation(
    async (key) => ({ key, url: `https://cdn.fixture.test/${key}` }),
  );
  return { storage: { upload }, upload };
}

async function buildFixtureApp(
  prismaOverrides: Parameters<typeof createFixturePrismaStore>[0] = {},
  storage?: ObjectStorage,
) {
  const prisma = createFixturePrismaStore(prismaOverrides);
  const app = await buildApp({
    prisma,
    telegramBotToken: "fixture-bot-token",
    jwtSecret: FIXTURE_JWT_SECRET,
    metaAppId: "meta-app-id",
    metaAppSecret: "meta-app-secret",
    metaWebhookVerifyToken: "meta-webhook-verify-token",
    tokenEncryptionKey: FIXTURE_TOKEN_ENCRYPTION_KEY,
    baseUrl: FIXTURE_BASE_URL,
    storage,
  });

  return { app, prisma };
}

async function signJwt(app: FastifyInstance, payload: { sub: string; telegramUserId: string }): Promise<string> {
  return app.jwt.sign(payload, { expiresIn: "1h" });
}

describe("POST /uploads", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app.close();
  });

  it("returns 401 without a valid bearer token", async () => {
    ({ app } = await buildFixtureApp());

    const response = await app.inject({
      method: "POST",
      url: "/uploads",
      headers: { "content-type": `multipart/form-data; boundary=${BOUNDARY}` },
      payload: buildMultipartPayload({ filename: "photo.jpg", contentType: "image/jpeg", data: Buffer.from("fake-jpeg-bytes") }),
    });

    expect(response.statusCode).toBe(401);
  });

  it("uploads the file to storage under uploads/<businessId>/ and returns its public url", async () => {
    const { storage, upload } = fakeObjectStorage();
    ({ app } = await buildFixtureApp({ business: { findFirst: vi.fn().mockResolvedValue({ id: "biz_1" }) } }, storage));
    const token = await signJwt(app, { sub: "user_1", telegramUserId: "42" });

    const response = await app.inject({
      method: "POST",
      url: "/uploads",
      headers: { authorization: `Bearer ${token}`, "content-type": `multipart/form-data; boundary=${BOUNDARY}` },
      payload: buildMultipartPayload({ filename: "photo.jpg", contentType: "image/jpeg", data: Buffer.from("fake-jpeg-bytes") }),
    });

    expect(response.statusCode).toBe(201);
    expect(upload).toHaveBeenCalledTimes(1);
    const [key, data, contentType] = upload.mock.calls[0]!;
    expect(key).toMatch(/^uploads\/biz_1\/[0-9a-f-]+\.jpg$/);
    expect((data as Buffer).toString()).toBe("fake-jpeg-bytes");
    expect(contentType).toBe("image/jpeg");
    expect(response.json()).toEqual({ url: `https://cdn.fixture.test/${key}` });
  });

  it("returns 400 for an unsupported content type", async () => {
    const { storage, upload } = fakeObjectStorage();
    ({ app } = await buildFixtureApp({ business: { findFirst: vi.fn().mockResolvedValue({ id: "biz_1" }) } }, storage));
    const token = await signJwt(app, { sub: "user_1", telegramUserId: "42" });

    const response = await app.inject({
      method: "POST",
      url: "/uploads",
      headers: { authorization: `Bearer ${token}`, "content-type": `multipart/form-data; boundary=${BOUNDARY}` },
      payload: buildMultipartPayload({ filename: "doc.pdf", contentType: "application/pdf", data: Buffer.from("%PDF-1.4") }),
    });

    expect(response.statusCode).toBe(400);
    expect(upload).not.toHaveBeenCalled();
  });

  it("returns 413 for a file over the size limit", async () => {
    const { storage, upload } = fakeObjectStorage();
    ({ app } = await buildFixtureApp({ business: { findFirst: vi.fn().mockResolvedValue({ id: "biz_1" }) } }, storage));
    const token = await signJwt(app, { sub: "user_1", telegramUserId: "42" });

    const response = await app.inject({
      method: "POST",
      url: "/uploads",
      headers: { authorization: `Bearer ${token}`, "content-type": `multipart/form-data; boundary=${BOUNDARY}` },
      payload: buildMultipartPayload({
        filename: "huge.jpg",
        contentType: "image/jpeg",
        data: Buffer.alloc(11 * 1024 * 1024, 1),
      }),
    });

    expect(response.statusCode).toBe(413);
    expect(upload).not.toHaveBeenCalled();
  });
});
