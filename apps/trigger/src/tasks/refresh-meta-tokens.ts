import { decryptToken, encryptToken } from "@postauto/shared";
import { refreshThreadsLongLivedToken, sendTelegramMessage } from "@postauto/social";
import { prisma } from "@postauto/db";
import { schedules } from "@trigger.dev/sdk";
import { loadEnv } from "../env.js";

/**
 * Facebook Page (and the IG Business account riding along on it) tokens
 * aren't tracked with an expiry in this schema -- routes/oauth.ts always
 * writes `tokenExpiresAt: null` for both, since a Page token derived from a
 * long-lived user token via Facebook Login for Business doesn't expire on a
 * fixed schedule the way Threads' does. So this cron only has Threads
 * accounts to act on; a Facebook/IG token going bad shows up as an
 * auth_error at publish time instead (see publish-post.ts), which already
 * notifies the seller.
 */
const DEFAULT_REFRESH_THRESHOLD_DAYS = 7;

export interface RefreshMetaTokensSocialAccount {
  id: string;
  accessTokenEncrypted: string;
  business: { name: string; telegramOwnerUserId: bigint };
}

type SocialAccountUpdateData = Partial<{
  accessTokenEncrypted: string;
  tokenExpiresAt: Date | null;
  status: "error";
}>;

/**
 * Structural subset of PrismaClient this task needs, mirroring the narrow
 * interface pattern used by collect-engagement-snapshots.ts's
 * CollectEngagementSnapshotsStore.
 */
export interface RefreshMetaTokensStore {
  socialAccount: {
    findMany(args: {
      where: {
        platform: "threads";
        status: "active";
        OR: [{ tokenExpiresAt: { lte: Date } }, { tokenExpiresAt: null }];
      };
      include: { business: true };
    }): Promise<RefreshMetaTokensSocialAccount[]>;
    update(args: { where: { id: string }; data: SocialAccountUpdateData }): Promise<unknown>;
  };
}

export interface RefreshMetaTokensDeps {
  store: RefreshMetaTokensStore;
  /** Injectable for tests; defaults to packages/social's refreshThreadsLongLivedToken. */
  refreshThreadsLongLivedToken: (params: { accessToken: string }) => Promise<{ accessToken: string; expiresIn?: number }>;
  /** Injectable for tests; defaults to decryptToken. */
  decryptToken: (payload: string, hexKey: string) => string;
  /** Injectable for tests; defaults to encryptToken. */
  encryptToken: (plaintext: string, hexKey: string) => string;
  tokenEncryptionKey: string;
  /** Injectable for tests; defaults to sendTelegramMessage. Notifies the seller when a token can no longer be refreshed. */
  notifySeller: (payload: { chatId: bigint; text: string }) => Promise<unknown>;
  /** Injectable for tests; defaults to `() => new Date()`. */
  now: () => Date;
  /** Refresh proactively once a token is within this many days of expiring. */
  refreshThresholdDays?: number;
}

export interface RefreshMetaTokensResult {
  refreshed: number;
  failed: number;
}

/**
 * Pure orchestration for refresh-meta-tokens: finds every active Threads
 * social_account whose token is within refreshThresholdDays of expiring,
 * refreshes it via `th_refresh_token`, and persists the new encrypted token
 * + expiry. A token that can no longer be refreshed (revoked, past Meta's
 * refresh window, etc.) marks the account `status: "error"` -- the same
 * status publish-post.ts already checks for and refuses to publish against
 * -- and notifies the seller via Telegram that they need to reconnect,
 * since without this cron a lapsed Threads token would otherwise only
 * surface as a silent publish failure with no proactive warning.
 */
export async function runRefreshMetaTokens(deps: RefreshMetaTokensDeps): Promise<RefreshMetaTokensResult> {
  const thresholdMs = (deps.refreshThresholdDays ?? DEFAULT_REFRESH_THRESHOLD_DAYS) * 24 * 60 * 60 * 1000;
  const cutoff = new Date(deps.now().getTime() + thresholdMs);

  const accounts = await deps.store.socialAccount.findMany({
    // A null tokenExpiresAt means Meta's response omitted expires_in (see the
    // write path below and routes/oauth.ts's initial Threads connect) -- treat
    // that as unknown-and-due, not never-due, so the account doesn't become
    // permanently invisible to this sweep.
    where: { platform: "threads", status: "active", OR: [{ tokenExpiresAt: { lte: cutoff } }, { tokenExpiresAt: null }] },
    include: { business: true },
  });

  let refreshed = 0;
  let failed = 0;

  for (const account of accounts) {
    const currentToken = deps.decryptToken(account.accessTokenEncrypted, deps.tokenEncryptionKey);

    try {
      const result = await deps.refreshThreadsLongLivedToken({ accessToken: currentToken });
      await deps.store.socialAccount.update({
        where: { id: account.id },
        data: {
          accessTokenEncrypted: deps.encryptToken(result.accessToken, deps.tokenEncryptionKey),
          tokenExpiresAt: result.expiresIn ? new Date(deps.now().getTime() + result.expiresIn * 1000) : null,
        },
      });
      refreshed += 1;
    } catch {
      failed += 1;
      await deps.store.socialAccount.update({ where: { id: account.id }, data: { status: "error" } });

      // Best-effort: a failed Telegram notification shouldn't mask the token
      // refresh failure itself, which is already durably recorded above.
      try {
        await deps.notifySeller({
          chatId: account.business.telegramOwnerUserId,
          text: `Your Threads connection for ${account.business.name} has expired. Reconnect it in PostAuto to keep posting.`,
        });
      } catch (notifyError) {
        console.error(`Failed to notify seller of expired Threads token for account ${account.id}`, notifyError);
      }
    }
  }

  return { refreshed, failed };
}

const prismaStore: RefreshMetaTokensStore = {
  socialAccount: {
    findMany: (args) =>
      prisma.socialAccount.findMany({
        where: args.where,
        include: { business: { select: { name: true, telegramOwnerUserId: true } } },
      }) as unknown as Promise<RefreshMetaTokensSocialAccount[]>,
    update: (args) => prisma.socialAccount.update(args),
  },
};

/**
 * Runs daily -- Threads tokens are long-lived (~60 days) and Meta requires
 * the token being refreshed to be at least 24 hours old, so a daily sweep
 * comfortably keeps every account inside the refresh window well before
 * expiry without redundant calls.
 */
export const refreshMetaTokensTask = schedules.task({
  id: "refresh-meta-tokens",
  cron: "0 4 * * *",
  run: async () => {
    const env = loadEnv();
    return runRefreshMetaTokens({
      store: prismaStore,
      refreshThreadsLongLivedToken,
      decryptToken,
      encryptToken,
      tokenEncryptionKey: env.TOKEN_ENCRYPTION_KEY,
      notifySeller: ({ chatId, text }) => sendTelegramMessage({ botToken: env.TELEGRAM_BOT_TOKEN, chatId, text }),
      now: () => new Date(),
    });
  },
});
