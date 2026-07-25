import { GraphApiError, GraphClient } from "@postauto/social";
import { describe, expect, it, vi } from "vitest";
import { runPublishPost, type PublishPostDeps, type PublishPostVariant } from "./publish-post.js";

const TOKEN_ENCRYPTION_KEY = "fixture-key";

function buildVariant(overrides: Partial<PublishPostVariant> = {}): PublishPostVariant {
  return {
    id: "variant_1",
    socialAccountId: "account_1",
    platform: "facebook_page",
    captionText: "New arrivals!",
    mediaUrls: ["https://cdn.test/photo.jpg"],
    retryCount: 0,
    post: {
      id: "post_1",
      platformVariants: [{ id: "variant_1", variantStatus: "publishing" }],
      business: {
        name: "Boutique Addis",
        telegramOwnerUserId: 555666777n,
        socialAccounts: [
          {
            id: "account_1",
            platform: "facebook_page",
            externalAccountId: "page-123",
            accessTokenEncrypted: "encrypted-token",
            status: "active",
          },
        ],
      },
    },
    ...overrides,
  };
}

function buildDeps(
  overrides: Partial<{
    variant: PublishPostVariant | null;
    findMany: ReturnType<typeof vi.fn>;
    publishPhoto: PublishPostDeps["publishPhoto"];
    publishInstagramPhoto: PublishPostDeps["publishInstagramPhoto"];
    publishThreadsPost: PublishPostDeps["publishThreadsPost"];
    notifySeller: ReturnType<typeof vi.fn>;
  }> = {},
): {
  deps: PublishPostDeps;
  findUnique: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  postUpdate: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
  notifySeller: ReturnType<typeof vi.fn>;
} {
  const variant = "variant" in overrides ? overrides.variant : buildVariant();
  const findUnique = vi.fn().mockResolvedValue(variant);
  const update = vi.fn().mockResolvedValue(undefined);
  const postUpdate = vi.fn().mockResolvedValue(undefined);
  // Defaults to the same list the initial findUnique returned; tests exercising
  // the concurrent-sibling race override this to return statuses that have
  // since changed underneath the in-memory `variant` snapshot.
  const findMany = overrides.findMany ?? vi.fn().mockResolvedValue(variant ? variant.post.platformVariants : []);
  const notifySeller = overrides.notifySeller ?? vi.fn().mockResolvedValue(undefined);

  const deps: PublishPostDeps = {
    store: { postPlatformVariant: { findUnique, update, findMany }, post: { update: postUpdate } },
    graphClient: new GraphClient(),
    threadsGraphClient: new GraphClient({ baseUrl: "https://graph.threads.test" }),
    publishPhoto:
      overrides.publishPhoto ?? vi.fn().mockResolvedValue({ photoId: "photo-1", postId: "page-123_post-1" }),
    publishInstagramPhoto: overrides.publishInstagramPhoto ?? vi.fn().mockResolvedValue({ mediaId: "ig-media-1" }),
    publishThreadsPost: overrides.publishThreadsPost ?? vi.fn().mockResolvedValue({ mediaId: "threads-media-1" }),
    decryptToken: vi.fn((payload: string) => `decrypted:${payload}`),
    tokenEncryptionKey: TOKEN_ENCRYPTION_KEY,
    notifySeller,
  };

  return { deps, findUnique, update, postUpdate, findMany, notifySeller };
}

describe("runPublishPost", () => {
  it("publishes to Facebook: publishing -> published, using the decrypted page token, and rolls the post up to published", async () => {
    const { deps, update, postUpdate, notifySeller } = buildDeps();

    await runPublishPost(deps, { postPlatformVariantId: "variant_1" });

    expect(deps.decryptToken).toHaveBeenCalledWith("encrypted-token", TOKEN_ENCRYPTION_KEY);
    expect(deps.publishPhoto).toHaveBeenCalledWith(deps.graphClient, {
      pageId: "page-123",
      pageAccessToken: "decrypted:encrypted-token",
      imageUrl: "https://cdn.test/photo.jpg",
      caption: "New arrivals!",
    });

    expect(update).toHaveBeenNthCalledWith(1, {
      where: { id: "variant_1" },
      data: { variantStatus: "publishing" },
    });
    expect(update).toHaveBeenNthCalledWith(2, {
      where: { id: "variant_1" },
      data: { variantStatus: "published", externalPostId: "page-123_post-1" },
    });
    expect(update).toHaveBeenCalledTimes(2);
    expect(postUpdate).toHaveBeenCalledWith({ where: { id: "post_1" }, data: { status: "published" } });
    expect(notifySeller).not.toHaveBeenCalled();
  });

  it("publishes to Instagram using the two-step container flow", async () => {
    const { deps, update } = buildDeps({
      variant: buildVariant({
        platform: "instagram_business",
        socialAccountId: "account_ig",
        post: {
          id: "post_1",
          platformVariants: [{ id: "variant_1", variantStatus: "publishing" }],
          business: {
            name: "Boutique Addis",
            telegramOwnerUserId: 555666777n,
            socialAccounts: [
              {
                id: "account_ig",
                platform: "instagram_business",
                externalAccountId: "ig-user-1",
                accessTokenEncrypted: "encrypted-page-token",
                status: "active",
              },
            ],
          },
        },
      }),
    });

    await runPublishPost(deps, { postPlatformVariantId: "variant_1" });

    expect(deps.publishInstagramPhoto).toHaveBeenCalledWith(deps.graphClient, {
      igUserId: "ig-user-1",
      pageAccessToken: "decrypted:encrypted-page-token",
      imageUrl: "https://cdn.test/photo.jpg",
      caption: "New arrivals!",
    });
    expect(update).toHaveBeenNthCalledWith(2, {
      where: { id: "variant_1" },
      data: { variantStatus: "published", externalPostId: "ig-media-1" },
    });
  });

  it("publishes a text-only Threads post using the threads-specific GraphClient", async () => {
    const { deps, update } = buildDeps({
      variant: buildVariant({
        platform: "threads",
        socialAccountId: "account_threads",
        mediaUrls: [],
        captionText: "New arrivals!",
        post: {
          id: "post_1",
          platformVariants: [{ id: "variant_1", variantStatus: "publishing" }],
          business: {
            name: "Boutique Addis",
            telegramOwnerUserId: 555666777n,
            socialAccounts: [
              {
                id: "account_threads",
                platform: "threads",
                externalAccountId: "threads-user-1",
                accessTokenEncrypted: "encrypted-threads-token",
                status: "active",
              },
            ],
          },
        },
      }),
    });

    await runPublishPost(deps, { postPlatformVariantId: "variant_1" });

    expect(deps.publishThreadsPost).toHaveBeenCalledWith(deps.threadsGraphClient, {
      threadsUserId: "threads-user-1",
      accessToken: "decrypted:encrypted-threads-token",
      text: "New arrivals!",
      imageUrl: undefined,
    });
    expect(update).toHaveBeenNthCalledWith(2, {
      where: { id: "variant_1" },
      data: { variantStatus: "published", externalPostId: "threads-media-1" },
    });
  });

  it("does not roll the post up while sibling variants are still pending", async () => {
    const { deps, postUpdate } = buildDeps({
      variant: buildVariant({
        post: {
          id: "post_1",
          platformVariants: [
            { id: "variant_1", variantStatus: "publishing" },
            { id: "variant_2", variantStatus: "pending" },
          ],
          business: {
            name: "Boutique Addis",
            telegramOwnerUserId: 555666777n,
            socialAccounts: [
              {
                id: "account_1",
                platform: "facebook_page",
                externalAccountId: "page-123",
                accessTokenEncrypted: "encrypted-token",
                status: "active",
              },
            ],
          },
        },
      }),
    });

    await runPublishPost(deps, { postPlatformVariantId: "variant_1" });

    expect(postUpdate).not.toHaveBeenCalled();
  });

  it("rolls the post up using freshly-fetched sibling statuses, not the stale snapshot from task start", async () => {
    // Simulates the concurrent-publish race: both variants were still "pending"
    // when this task's findUnique ran, but variant_2 has since finished by the
    // time variant_1 completes and computes the rollup.
    const { deps, postUpdate, findMany } = buildDeps({
      variant: buildVariant({
        post: {
          id: "post_1",
          platformVariants: [
            { id: "variant_1", variantStatus: "pending" },
            { id: "variant_2", variantStatus: "pending" },
          ],
          business: {
            name: "Boutique Addis",
            telegramOwnerUserId: 555666777n,
            socialAccounts: [
              {
                id: "account_1",
                platform: "facebook_page",
                externalAccountId: "page-123",
                accessTokenEncrypted: "encrypted-token",
                status: "active",
              },
            ],
          },
        },
      }),
      findMany: vi.fn().mockResolvedValue([
        { id: "variant_1", variantStatus: "publishing" },
        { id: "variant_2", variantStatus: "published" },
      ]),
    });

    await runPublishPost(deps, { postPlatformVariantId: "variant_1" });

    expect(findMany).toHaveBeenCalledWith({ where: { postId: "post_1" } });
    expect(postUpdate).toHaveBeenCalledWith({ where: { id: "post_1" }, data: { status: "published" } });
  });

  it("rolls the post up to 'partial' once every sibling variant is terminal but outcomes differ", async () => {
    const { deps, postUpdate } = buildDeps({
      variant: buildVariant({
        post: {
          id: "post_1",
          platformVariants: [
            { id: "variant_1", variantStatus: "publishing" },
            { id: "variant_2", variantStatus: "failed" },
          ],
          business: {
            name: "Boutique Addis",
            telegramOwnerUserId: 555666777n,
            socialAccounts: [
              {
                id: "account_1",
                platform: "facebook_page",
                externalAccountId: "page-123",
                accessTokenEncrypted: "encrypted-token",
                status: "active",
              },
            ],
          },
        },
      }),
    });

    await runPublishPost(deps, { postPlatformVariantId: "variant_1" });

    expect(postUpdate).toHaveBeenCalledWith({ where: { id: "post_1" }, data: { status: "partial" } });
  });

  it("falls back to the photo id as externalPostId when Meta doesn't return a feed post id", async () => {
    const { deps, update } = buildDeps({
      publishPhoto: vi.fn().mockResolvedValue({ photoId: "photo-2", postId: null }),
    });

    await runPublishPost(deps, { postPlatformVariantId: "variant_1" });

    expect(update).toHaveBeenNthCalledWith(2, {
      where: { id: "variant_1" },
      data: { variantStatus: "published", externalPostId: "photo-2" },
    });
  });

  it("omits caption from the publish call when captionText is null", async () => {
    const { deps } = buildDeps({ variant: buildVariant({ captionText: null }) });

    await runPublishPost(deps, { postPlatformVariantId: "variant_1" });

    expect(deps.publishPhoto).toHaveBeenCalledWith(
      deps.graphClient,
      expect.objectContaining({ caption: undefined }),
    );
  });

  it("throws when the variant does not exist, without writing any status", async () => {
    const { deps, update } = buildDeps({ variant: null });

    await expect(runPublishPost(deps, { postPlatformVariantId: "missing" })).rejects.toThrow(
      "PostPlatformVariant missing not found",
    );
    expect(update).not.toHaveBeenCalled();
    expect(deps.publishPhoto).not.toHaveBeenCalled();
  });

  it("marks the variant failed when its targeted account is no longer active or connected", async () => {
    const { deps, update, postUpdate, notifySeller } = buildDeps({
      variant: buildVariant({
        post: {
          id: "post_1",
          platformVariants: [{ id: "variant_1", variantStatus: "publishing" }],
          business: { name: "Boutique Addis", telegramOwnerUserId: 555666777n, socialAccounts: [] },
        },
      }),
    });

    await runPublishPost(deps, { postPlatformVariantId: "variant_1" });

    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({
      where: { id: "variant_1" },
      data: {
        variantStatus: "failed",
        errorMessage: "The connected account for this post is no longer active. Reconnect it and try again.",
      },
    });
    expect(deps.publishPhoto).not.toHaveBeenCalled();
    expect(postUpdate).toHaveBeenCalledWith({ where: { id: "post_1" }, data: { status: "failed" } });
    expect(notifySeller).toHaveBeenCalledWith({
      chatId: 555666777n,
      text: expect.stringContaining("facebook_page"),
    });
  });

  it("marks the variant failed when a media-requiring platform has no media to publish", async () => {
    const { deps, update } = buildDeps({ variant: buildVariant({ mediaUrls: [] }) });

    await runPublishPost(deps, { postPlatformVariantId: "variant_1" });

    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({
      where: { id: "variant_1" },
      data: { variantStatus: "failed", errorMessage: "Variant has no content to publish." },
    });
  });

  it("marks the variant failed when a Threads variant has neither text nor media", async () => {
    const { deps, update } = buildDeps({
      variant: buildVariant({ platform: "threads", mediaUrls: [], captionText: null }),
    });

    await runPublishPost(deps, { postPlatformVariantId: "variant_1" });

    expect(update).toHaveBeenCalledWith({
      where: { id: "variant_1" },
      data: { variantStatus: "failed", errorMessage: "Variant has no content to publish." },
    });
  });

  it("marks the variant failed (no retry) on a non-retryable Graph API error, and notifies the seller", async () => {
    const authError = new GraphApiError({
      message: "Error validating access token",
      status: 401,
      category: "auth_error",
      code: 190,
    });
    const { deps, update, notifySeller } = buildDeps({ publishPhoto: vi.fn().mockRejectedValue(authError) });

    await expect(runPublishPost(deps, { postPlatformVariantId: "variant_1" })).resolves.toBeUndefined();

    expect(update).toHaveBeenNthCalledWith(1, { where: { id: "variant_1" }, data: { variantStatus: "publishing" } });
    expect(update).toHaveBeenNthCalledWith(2, {
      where: { id: "variant_1" },
      data: { variantStatus: "failed", errorMessage: "Error validating access token" },
    });
    expect(update).toHaveBeenCalledTimes(2);
    expect(notifySeller).toHaveBeenCalledWith({
      chatId: 555666777n,
      text: expect.stringContaining("Error validating access token"),
    });
  });

  it("does not fail the run when notifying the seller of a publish failure fails", async () => {
    const authError = new GraphApiError({
      message: "Error validating access token",
      status: 401,
      category: "auth_error",
      code: 190,
    });
    const notifySeller = vi.fn().mockRejectedValue(new Error("telegram unreachable"));
    const { deps } = buildDeps({ publishPhoto: vi.fn().mockRejectedValue(authError), notifySeller });

    await expect(runPublishPost(deps, { postPlatformVariantId: "variant_1" })).resolves.toBeUndefined();
  });

  it("increments retryCount and rethrows on a retryable Graph API error, without marking failed or notifying the seller", async () => {
    const rateLimitError = new GraphApiError({
      message: "Application request limit reached",
      status: 429,
      category: "rate_limited",
      code: 4,
    });
    const { deps, update, postUpdate, notifySeller } = buildDeps({
      publishPhoto: vi.fn().mockRejectedValue(rateLimitError),
    });

    await expect(runPublishPost(deps, { postPlatformVariantId: "variant_1" })).rejects.toBe(rateLimitError);

    expect(update).toHaveBeenNthCalledWith(1, { where: { id: "variant_1" }, data: { variantStatus: "publishing" } });
    expect(update).toHaveBeenNthCalledWith(2, { where: { id: "variant_1" }, data: { retryCount: 1 } });
    expect(update).toHaveBeenCalledTimes(2);
    expect(postUpdate).not.toHaveBeenCalled();
    expect(notifySeller).not.toHaveBeenCalled();
  });

  it("treats an unclassified (non-GraphApiError) failure as retryable", async () => {
    const networkError = new TypeError("fetch failed");
    const { deps, update } = buildDeps({ publishPhoto: vi.fn().mockRejectedValue(networkError) });

    await expect(runPublishPost(deps, { postPlatformVariantId: "variant_1" })).rejects.toBe(networkError);

    expect(update).toHaveBeenNthCalledWith(2, { where: { id: "variant_1" }, data: { retryCount: 1 } });
  });
});
