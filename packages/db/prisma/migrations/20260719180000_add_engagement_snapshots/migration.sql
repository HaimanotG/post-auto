-- CreateTable
CREATE TABLE "engagement_snapshots" (
    "id" TEXT NOT NULL,
    "post_platform_variant_id" TEXT NOT NULL,
    "captured_at" TIMESTAMP(3) NOT NULL,
    "likes_count" INTEGER NOT NULL DEFAULT 0,
    "comments_count" INTEGER NOT NULL DEFAULT 0,
    "shares_count" INTEGER NOT NULL DEFAULT 0,
    "reach" INTEGER NOT NULL DEFAULT 0,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "engagement_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "engagement_snapshots_post_platform_variant_id_captured_at_idx" ON "engagement_snapshots"("post_platform_variant_id", "captured_at");

-- AddForeignKey
ALTER TABLE "engagement_snapshots" ADD CONSTRAINT "engagement_snapshots_post_platform_variant_id_fkey" FOREIGN KEY ("post_platform_variant_id") REFERENCES "post_platform_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
