-- AlterTable: add the column nullable first so existing rows can be backfilled
ALTER TABLE "post_platform_variants" ADD COLUMN "social_account_id" TEXT;

-- Backfill: match each existing variant to a connected account of the same
-- platform on its post's business, preferring the earliest-connected one --
-- this mirrors the implicit "first active account" selection the publish-post
-- trigger task used before this migration, so already-published/pending
-- variants keep pointing at the account they actually used.
UPDATE "post_platform_variants" AS ppv
SET "social_account_id" = (
  SELECT sa.id
  FROM "social_accounts" AS sa
  JOIN "posts" AS p ON p.business_id = sa.business_id
  WHERE p.id = ppv.post_id AND sa.platform = ppv.platform
  ORDER BY sa.created_at ASC
  LIMIT 1
)
WHERE ppv.social_account_id IS NULL;

-- Any variant that still has no match (platform disconnected since the
-- variant was created) can't satisfy the NOT NULL/FK below; drop it rather
-- than leave an unpublishable, unreferenceable row behind.
DELETE FROM "post_platform_variants" WHERE "social_account_id" IS NULL;

-- AlterTable: now safe to require it
ALTER TABLE "post_platform_variants" ALTER COLUMN "social_account_id" SET NOT NULL;

-- Replace the old (post_id, platform) uniqueness -- a post can now target
-- several accounts of the same platform (e.g. two Facebook Pages).
DROP INDEX "post_platform_variants_post_id_platform_key";
CREATE UNIQUE INDEX "post_platform_variants_post_id_social_account_id_key" ON "post_platform_variants"("post_id", "social_account_id");

-- AddForeignKey
ALTER TABLE "post_platform_variants" ADD CONSTRAINT "post_platform_variants_social_account_id_fkey" FOREIGN KEY ("social_account_id") REFERENCES "social_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
