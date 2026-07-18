import { GraphApiError, GraphClient } from "@postauto/social";
import { describe, expect, it, vi } from "vitest";
import { runPublishPost, type PublishPostDeps, type PublishPostVariant } from "./publish-post.js";

const TOKEN_ENCRYPTION_KEY = "fixture-key";

function buildVariant(overrides: Partial<PublishPostVariant> = {}): PublishPostVariant {
  return {
    id: "variant_1",
    platform: "facebook_page",
    captionText: "New arrivals!",
    mediaUrls: ["https://cdn.test/photo.jpg"],
    retryCount: 0,
    post: {
      business: {
        socialAccounts: [
          {
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
    publishPhoto: PublishPostDeps["publishPhoto"];
  }> = {},
): { deps: PublishPostDeps; findUnique: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> } {
  const variant = "variant" in overrides ? overrides.variant : buildVariant();
  const findUnique = vi.fn().mockResolvedValue(variant);
  const update = vi.fn().mockResolvedValue(undefined);

  const deps: PublishPostDeps = {
    store: { postPlatformVariant: { findUnique, update } },
    graphClient: new GraphClient(),
    publishPhoto: overrides.publishPhoto ?? vi.fn().mockResolvedValue({ photoId: "photo-1", postId: "page-123_post-1" }),
    decryptToken: vi.fn((payload: string) => `decrypted:${payload}`),
    tokenEncryptionKey: TOKEN_ENCRYPTION_KEY,
  };

  return { deps, findUnique, update };
}

describe("runPublishPost", () => {
  it("publishes successfully: publishing -> published, using the decrypted page token", async () => {
    const { deps, update } = buildDeps();

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

  it("marks the variant failed (no publish attempt) for an unsupported platform", async () => {
    const { deps, update } = buildDeps({ variant: buildVariant({ platform: "instagram_business" }) });

    await runPublishPost(deps, { postPlatformVariantId: "variant_1" });

    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({
      where: { id: "variant_1" },
      data: {
        variantStatus: "failed",
        errorMessage: 'publish-post only supports the facebook_page platform in M1, got "instagram_business"',
      },
    });
    expect(deps.publishPhoto).not.toHaveBeenCalled();
  });

  it("marks the variant failed when no active Facebook Page connection exists", async () => {
    const { deps, update } = buildDeps({
      variant: buildVariant({
        post: { business: { socialAccounts: [] } },
      }),
    });

    await runPublishPost(deps, { postPlatformVariantId: "variant_1" });

    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({
      where: { id: "variant_1" },
      data: { variantStatus: "failed", errorMessage: "No active Facebook Page connection found for this business." },
    });
    expect(deps.publishPhoto).not.toHaveBeenCalled();
  });

  it("marks the variant failed when it has no media to publish", async () => {
    const { deps, update } = buildDeps({ variant: buildVariant({ mediaUrls: [] }) });

    await runPublishPost(deps, { postPlatformVariantId: "variant_1" });

    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({
      where: { id: "variant_1" },
      data: { variantStatus: "failed", errorMessage: "Variant has no media to publish." },
    });
  });

  it("marks the variant failed (no retry) on a non-retryable Graph API error", async () => {
    const authError = new GraphApiError({
      message: "Error validating access token",
      status: 401,
      category: "auth_error",
      code: 190,
    });
    const { deps, update } = buildDeps({ publishPhoto: vi.fn().mockRejectedValue(authError) });

    await expect(runPublishPost(deps, { postPlatformVariantId: "variant_1" })).resolves.toBeUndefined();

    expect(update).toHaveBeenNthCalledWith(1, { where: { id: "variant_1" }, data: { variantStatus: "publishing" } });
    expect(update).toHaveBeenNthCalledWith(2, {
      where: { id: "variant_1" },
      data: { variantStatus: "failed", errorMessage: "Error validating access token" },
    });
    expect(update).toHaveBeenCalledTimes(2);
  });

  it("increments retryCount and rethrows on a retryable Graph API error, without marking failed", async () => {
    const rateLimitError = new GraphApiError({
      message: "Application request limit reached",
      status: 429,
      category: "rate_limited",
      code: 4,
    });
    const { deps, update } = buildDeps({ publishPhoto: vi.fn().mockRejectedValue(rateLimitError) });

    await expect(runPublishPost(deps, { postPlatformVariantId: "variant_1" })).rejects.toBe(rateLimitError);

    expect(update).toHaveBeenNthCalledWith(1, { where: { id: "variant_1" }, data: { variantStatus: "publishing" } });
    expect(update).toHaveBeenNthCalledWith(2, { where: { id: "variant_1" }, data: { retryCount: 1 } });
    expect(update).toHaveBeenCalledTimes(2);
  });

  it("treats an unclassified (non-GraphApiError) failure as retryable", async () => {
    const networkError = new TypeError("fetch failed");
    const { deps, update } = buildDeps({ publishPhoto: vi.fn().mockRejectedValue(networkError) });

    await expect(runPublishPost(deps, { postPlatformVariantId: "variant_1" })).rejects.toBe(networkError);

    expect(update).toHaveBeenNthCalledWith(2, { where: { id: "variant_1" }, data: { retryCount: 1 } });
  });
});
