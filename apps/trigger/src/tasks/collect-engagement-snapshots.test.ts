import { GraphClient } from "@postauto/social";
import { describe, expect, it, vi } from "vitest";
import {
  runCollectEngagementSnapshots,
  type CollectEngagementSnapshotsDeps,
  type CollectEngagementSnapshotsVariant,
} from "./collect-engagement-snapshots.js";

const TOKEN_ENCRYPTION_KEY = "fixture-key";
const CAPTURED_AT = new Date("2026-07-20T12:00:00.000Z");

function buildVariant(overrides: Partial<CollectEngagementSnapshotsVariant> = {}): CollectEngagementSnapshotsVariant {
  return {
    id: "variant_1",
    platform: "facebook_page",
    externalPostId: "page-123_post-1",
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
    variants: CollectEngagementSnapshotsVariant[];
    fetchEngagement: CollectEngagementSnapshotsDeps["fetchEngagement"];
  }> = {},
): { deps: CollectEngagementSnapshotsDeps; findMany: ReturnType<typeof vi.fn>; createMany: ReturnType<typeof vi.fn> } {
  const variants = overrides.variants ?? [buildVariant()];
  const findMany = vi.fn().mockResolvedValue(variants);
  const createMany = vi.fn().mockResolvedValue(undefined);

  const deps: CollectEngagementSnapshotsDeps = {
    store: { postPlatformVariant: { findMany }, engagementSnapshot: { createMany } },
    graphClientFactory: vi.fn(() => new GraphClient()),
    fetchEngagement:
      overrides.fetchEngagement ??
      vi.fn().mockResolvedValue({ likesCount: 10, commentsCount: 2, sharesCount: 1, reach: 300, impressions: 500 }),
    decryptToken: vi.fn((payload: string) => `decrypted:${payload}`),
    tokenEncryptionKey: TOKEN_ENCRYPTION_KEY,
    now: () => CAPTURED_AT,
  };

  return { deps, findMany, createMany };
}

describe("runCollectEngagementSnapshots", () => {
  it("fetches metrics for every published variant with an active social account and persists one snapshot per variant", async () => {
    const { deps, createMany } = buildDeps();

    const result = await runCollectEngagementSnapshots(deps);

    expect(deps.decryptToken).toHaveBeenCalledWith("encrypted-token", TOKEN_ENCRYPTION_KEY);
    expect(deps.fetchEngagement).toHaveBeenCalledWith(
      "facebook_page",
      expect.any(GraphClient),
      { externalPostId: "page-123_post-1", accessToken: "decrypted:encrypted-token" },
    );
    expect(createMany).toHaveBeenCalledWith({
      data: [
        {
          postPlatformVariantId: "variant_1",
          capturedAt: CAPTURED_AT,
          likesCount: 10,
          commentsCount: 2,
          sharesCount: 1,
          reach: 300,
          impressions: 500,
        },
      ],
    });
    expect(result).toEqual({ captured: 1, skipped: 0, errors: [] });
  });

  it("scopes the query to a single business when businessId is provided", async () => {
    const { deps, findMany } = buildDeps();

    await runCollectEngagementSnapshots(deps, { businessId: "biz_1" });

    expect(findMany).toHaveBeenCalledWith({
      where: {
        variantStatus: "published",
        externalPostId: { not: null },
        post: { businessId: "biz_1" },
      },
      include: { post: { include: { business: { include: { socialAccounts: true } } } } },
    });
  });

  it("uses a threads.net-based GraphClient for threads variants", async () => {
    const variant = buildVariant({
      platform: "threads",
      externalPostId: "thread-1",
      post: {
        business: {
          socialAccounts: [
            { platform: "threads", externalAccountId: "threads-user-1", accessTokenEncrypted: "enc-threads", status: "active" },
          ],
        },
      },
    });
    const { deps } = buildDeps({ variants: [variant] });

    await runCollectEngagementSnapshots(deps);

    expect(deps.graphClientFactory).toHaveBeenCalledWith("threads");
  });

  it("skips a variant with no active social account for its platform, without fetching or persisting", async () => {
    const variant = buildVariant({ post: { business: { socialAccounts: [] } } });
    const { deps, createMany } = buildDeps({ variants: [variant] });

    const result = await runCollectEngagementSnapshots(deps);

    expect(deps.fetchEngagement).not.toHaveBeenCalled();
    expect(createMany).not.toHaveBeenCalled();
    expect(result).toEqual({ captured: 0, skipped: 1, errors: [] });
  });

  it("skips a variant whose only matching social account is revoked/inactive", async () => {
    const variant = buildVariant({
      post: {
        business: {
          socialAccounts: [
            { platform: "facebook_page", externalAccountId: "page-123", accessTokenEncrypted: "encrypted-token", status: "revoked" },
          ],
        },
      },
    });
    const { deps } = buildDeps({ variants: [variant] });

    const result = await runCollectEngagementSnapshots(deps);

    expect(result).toEqual({ captured: 0, skipped: 1, errors: [] });
  });

  it("records a per-variant error and keeps processing the rest of the batch, without failing the whole run", async () => {
    const variants = [
      buildVariant({ id: "variant_1" }),
      buildVariant({ id: "variant_2", externalPostId: "page-123_post-2" }),
    ];
    const fetchEngagement = vi
      .fn()
      .mockRejectedValueOnce(new Error("Error validating access token"))
      .mockResolvedValueOnce({ likesCount: 5, commentsCount: 1, sharesCount: 0, reach: 100, impressions: 200 });
    const { deps, createMany } = buildDeps({ variants, fetchEngagement });

    const result = await runCollectEngagementSnapshots(deps);

    expect(result.captured).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.errors).toEqual([{ variantId: "variant_1", message: "Error validating access token" }]);
    expect(createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ postPlatformVariantId: "variant_2" }),
      ],
    });
  });

  it("does not call createMany at all when there is nothing to persist", async () => {
    const { deps, createMany } = buildDeps({ variants: [] });

    const result = await runCollectEngagementSnapshots(deps);

    expect(createMany).not.toHaveBeenCalled();
    expect(result).toEqual({ captured: 0, skipped: 0, errors: [] });
  });
});
