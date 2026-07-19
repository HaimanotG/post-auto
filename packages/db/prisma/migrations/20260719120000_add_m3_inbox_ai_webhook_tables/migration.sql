-- CreateEnum
CREATE TYPE "InboxMessageType" AS ENUM ('comment', 'mention', 'dm');

-- CreateEnum
CREATE TYPE "InboxMessageStatus" AS ENUM ('new', 'auto_replied', 'needs_attention', 'resolved', 'ignored');

-- CreateEnum
CREATE TYPE "AiReplyDecisionType" AS ENUM ('auto_reply', 'escalate', 'ignore');

-- CreateEnum
CREATE TYPE "WebhookEventProcessingStatus" AS ENUM ('received', 'processing', 'processed', 'failed');

-- CreateTable
CREATE TABLE "inbox_messages" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "social_account_id" TEXT,
    "platform" "Platform" NOT NULL,
    "type" "InboxMessageType" NOT NULL,
    "external_message_id" TEXT NOT NULL,
    "related_post_id" TEXT,
    "sender_external_id" TEXT NOT NULL,
    "sender_name" TEXT,
    "sender_username" TEXT,
    "body" TEXT NOT NULL,
    "status" "InboxMessageStatus" NOT NULL DEFAULT 'new',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inbox_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_reply_decisions" (
    "id" TEXT NOT NULL,
    "inbox_message_id" TEXT NOT NULL,
    "model_used" TEXT NOT NULL,
    "intent_classified" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "decision" "AiReplyDecisionType" NOT NULL,
    "reply_text" TEXT,
    "reasoning_snippet" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_reply_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "external_object_type" TEXT NOT NULL,
    "raw_payload" JSONB NOT NULL,
    "processing_status" "WebhookEventProcessingStatus" NOT NULL DEFAULT 'received',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "inbox_messages_external_message_id_key" ON "inbox_messages"("external_message_id");

-- CreateIndex
CREATE INDEX "inbox_messages_business_id_idx" ON "inbox_messages"("business_id");

-- CreateIndex
CREATE INDEX "inbox_messages_social_account_id_idx" ON "inbox_messages"("social_account_id");

-- CreateIndex
CREATE INDEX "inbox_messages_related_post_id_idx" ON "inbox_messages"("related_post_id");

-- CreateIndex
CREATE INDEX "ai_reply_decisions_inbox_message_id_idx" ON "ai_reply_decisions"("inbox_message_id");

-- CreateIndex
CREATE INDEX "webhook_events_processing_status_idx" ON "webhook_events"("processing_status");

-- AddForeignKey
ALTER TABLE "inbox_messages" ADD CONSTRAINT "inbox_messages_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbox_messages" ADD CONSTRAINT "inbox_messages_social_account_id_fkey" FOREIGN KEY ("social_account_id") REFERENCES "social_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbox_messages" ADD CONSTRAINT "inbox_messages_related_post_id_fkey" FOREIGN KEY ("related_post_id") REFERENCES "posts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_reply_decisions" ADD CONSTRAINT "ai_reply_decisions_inbox_message_id_fkey" FOREIGN KEY ("inbox_message_id") REFERENCES "inbox_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
