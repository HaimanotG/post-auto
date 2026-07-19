-- CreateTable
CREATE TABLE "rendered_slides" (
    "id" TEXT NOT NULL,
    "post_id" TEXT NOT NULL,
    "slide_index" INTEGER NOT NULL,
    "template_id" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "file_url" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rendered_slides_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rendered_slides_post_id_idx" ON "rendered_slides"("post_id");

-- AddForeignKey
ALTER TABLE "rendered_slides" ADD CONSTRAINT "rendered_slides_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
