-- AlterTable: nullable, no backfill needed -- existing rows show their externalAccountId in the UI until reconnected.
ALTER TABLE "social_accounts" ADD COLUMN "display_name" TEXT;
