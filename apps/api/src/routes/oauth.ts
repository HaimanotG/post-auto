import { randomBytes } from "node:crypto";
import { encryptToken, type Platform } from "@postauto/shared";
import {
  buildFacebookAuthorizationUrl,
  buildThreadsAuthorizationUrl,
  exchangeFacebookCodeForToken,
  exchangeThreadsCodeForToken,
  exchangeThreadsForLongLivedToken,
  fetchFacebookPageAccounts,
  FACEBOOK_OAUTH_SCOPES,
  GraphClient,
  THREADS_OAUTH_SCOPES,
} from "@postauto/social";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

/**
 * The two independent OAuth grants Meta exposes (see PLAN.md's "Meta Graph
 * API integration" section): Facebook Login for Business covers both
 * facebook_page and instagram_business (the IG Business account rides along
 * on the Page via `instagram_business_account`), so `facebook_page` is used
 * as the state token's platform even though an `instagram_business` row may
 * also be created as a side effect. Threads has its own separate grant.
 */
export type OAuthInitiablePlatform = "facebook_page" | "threads";

const oauthInitiablePlatformSchema = z.enum(["facebook_page", "threads"]);

/** Single-use CSRF state tokens expire after this long if never returned to the callback. */
const STATE_TOKEN_MAX_AGE_MS = 15 * 60 * 1000;

export interface AuthenticatedUser {
  id: string;
  telegramUserId: bigint;
}

interface StoredOAuthState {
  id: string;
  businessId: string;
  userId: string;
  // The DB column is the full Platform enum even though this route only ever
  // writes "facebook_page" | "threads" — kept wide so the real PrismaClient
  // (whose OAuthState.platform is the full enum) satisfies this structurally.
  platform: Platform;
  consumedAt: Date | null;
  createdAt: Date;
}

interface StoredSocialAccount {
  platform: Platform;
  externalAccountId: string;
  status: string;
}

interface SocialAccountWriteFields {
  accessTokenEncrypted: string;
  scopes: string[];
  status: "active";
  tokenExpiresAt: Date | null;
}

/**
 * Structural subset of PrismaClient this route needs, mirroring the narrow
 * interface pattern used by middleware/telegram-init-data.ts's
 * TelegramUserStore.
 */
export interface OAuthStore {
  business: {
    findFirst(args: { where: { telegramOwnerUserId: bigint } }): Promise<{ id: string } | null>;
    create(args: {
      data: { name: string; telegramOwnerUserId: bigint; timezone: string };
    }): Promise<{ id: string }>;
  };
  businessMember: {
    upsert(args: {
      where: { businessId_userId: { businessId: string; userId: string } };
      update: Record<string, never>;
      create: { businessId: string; userId: string; role: "owner" };
    }): Promise<unknown>;
  };
  oAuthState: {
    create(args: {
      data: { businessId: string; userId: string; platform: OAuthInitiablePlatform; stateToken: string };
    }): Promise<unknown>;
    findUnique(args: { where: { stateToken: string } }): Promise<StoredOAuthState | null>;
    update(args: { where: { id: string }; data: { consumedAt: Date } }): Promise<unknown>;
  };
  socialAccount: {
    upsert(args: {
      where: {
        businessId_platform_externalAccountId: {
          businessId: string;
          platform: Platform;
          externalAccountId: string;
        };
      };
      update: SocialAccountWriteFields;
      create: SocialAccountWriteFields & { businessId: string; platform: Platform; externalAccountId: string };
    }): Promise<unknown>;
    findMany(args: { where: { businessId: string } }): Promise<StoredSocialAccount[]>;
  };
}

export interface OAuthRoutesOptions {
  prisma: OAuthStore;
  metaAppId: string;
  metaAppSecret: string;
  /** 32 raw bytes hex-encoded (64 hex chars) — see packages/shared/src/crypto.ts. */
  tokenEncryptionKey: string;
  /** This API's own public HTTPS base URL, used to build the redirect_uri Meta requires. */
  baseUrl: string;
  /** Injectable for tests; defaults to a fresh GraphClient. */
  graphClient?: GraphClient;
  /** Injectable for tests; defaults to the global `fetch` (used for Threads' non-GraphClient endpoints). */
  threadsFetchImpl?: typeof fetch;
  /** Injectable for tests. */
  now?: () => Date;
}

function buildRedirectUri(baseUrl: string, platform: OAuthInitiablePlatform): string {
  return `${baseUrl.replace(/\/+$/, "")}/oauth/${platform}/callback`;
}

/**
 * Finds the business this Telegram user owns (per PLAN.md's `businesses`
 * table), creating one on first use, and ensures an owner membership row
 * exists. Every M1 route that needs a business_id resolves it this way until
 * a dedicated onboarding/business-creation flow exists.
 */
async function resolveOwnedBusiness(prisma: OAuthStore, user: AuthenticatedUser): Promise<{ id: string }> {
  const existing = await prisma.business.findFirst({ where: { telegramOwnerUserId: user.telegramUserId } });
  const business =
    existing ??
    (await prisma.business.create({
      data: {
        name: `Business ${user.telegramUserId}`,
        telegramOwnerUserId: user.telegramUserId,
        timezone: "Africa/Addis_Ababa",
      },
    }));

  await prisma.businessMember.upsert({
    where: { businessId_userId: { businessId: business.id, userId: user.id } },
    update: {},
    create: { businessId: business.id, userId: user.id, role: "owner" },
  });

  return business;
}

async function requireAuthenticatedUser(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<AuthenticatedUser | undefined> {
  try {
    const decoded = await request.jwtVerify<{ sub: string; telegramUserId: string }>();
    return { id: decoded.sub, telegramUserId: BigInt(decoded.telegramUserId) };
  } catch {
    await reply.code(401).send({ error: "Missing or invalid Authorization token" });
    return undefined;
  }
}

/**
 * Registers the Meta OAuth flow per PLAN.md: `/oauth/:platform/start` mints
 * a CSRF state token and returns the provider's authorization URL,
 * `/oauth/:platform/callback` exchanges the returned code for a token
 * (upgrading short-lived to long-lived, then resolving Page/IG/Threads
 * accounts) and persists encrypted tokens to `social_accounts`,
 * `/oauth/status` lets the mini app poll connection state after the
 * external-browser round trip.
 */
export function registerOAuthRoutes(app: FastifyInstance, options: OAuthRoutesOptions): void {
  const now = options.now ?? (() => new Date());

  app.get("/oauth/:platform/start", async (request, reply) => {
    const user = await requireAuthenticatedUser(request, reply);
    if (!user) return;

    const platformResult = oauthInitiablePlatformSchema.safeParse(
      (request.params as { platform?: string }).platform,
    );
    if (!platformResult.success) {
      await reply.code(400).send({ error: "Unsupported OAuth platform" });
      return;
    }
    const platform = platformResult.data;

    const business = await resolveOwnedBusiness(options.prisma, user);
    const stateToken = randomBytes(32).toString("hex");
    await options.prisma.oAuthState.create({
      data: { businessId: business.id, userId: user.id, platform, stateToken },
    });

    const redirectUri = buildRedirectUri(options.baseUrl, platform);
    const authorizationUrl =
      platform === "facebook_page"
        ? buildFacebookAuthorizationUrl({ appId: options.metaAppId, redirectUri, state: stateToken })
        : buildThreadsAuthorizationUrl({ appId: options.metaAppId, redirectUri, state: stateToken });

    return { authorizationUrl };
  });

  app.get("/oauth/:platform/callback", async (request, reply) => {
    const platformResult = oauthInitiablePlatformSchema.safeParse(
      (request.params as { platform?: string }).platform,
    );
    if (!platformResult.success) {
      await reply.code(400).send({ error: "Unsupported OAuth platform" });
      return;
    }
    const platform = platformResult.data;

    const query = request.query as Record<string, string | undefined>;
    const stateToken = query.state;
    if (!stateToken) {
      await reply.code(400).send({ error: "Missing state parameter" });
      return;
    }

    const state = await options.prisma.oAuthState.findUnique({ where: { stateToken } });
    const currentTime = now();
    const isStateValid =
      state !== null &&
      state.platform === platform &&
      state.consumedAt === null &&
      currentTime.getTime() - state.createdAt.getTime() <= STATE_TOKEN_MAX_AGE_MS;

    if (!state || !isStateValid) {
      await reply.code(400).send({ error: "Invalid or expired OAuth state" });
      return;
    }

    await options.prisma.oAuthState.update({ where: { id: state.id }, data: { consumedAt: currentTime } });

    if (query.error) {
      return { connected: false, error: query.error_description ?? query.error };
    }
    if (!query.code) {
      await reply.code(400).send({ error: "Missing code parameter" });
      return;
    }

    const redirectUri = buildRedirectUri(options.baseUrl, platform);
    const client = options.graphClient ?? new GraphClient();

    try {
      if (platform === "facebook_page") {
        const shortLived = await exchangeFacebookCodeForToken(client, {
          appId: options.metaAppId,
          appSecret: options.metaAppSecret,
          redirectUri,
          code: query.code,
        });
        const longLived = await client.exchangeForLongLivedToken({
          appId: options.metaAppId,
          appSecret: options.metaAppSecret,
          shortLivedToken: shortLived.accessToken,
        });
        const pages = await fetchFacebookPageAccounts(client, longLived.access_token);

        for (const page of pages) {
          const encryptedPageToken = encryptToken(page.accessToken, options.tokenEncryptionKey);
          await options.prisma.socialAccount.upsert({
            where: {
              businessId_platform_externalAccountId: {
                businessId: state.businessId,
                platform: "facebook_page",
                externalAccountId: page.id,
              },
            },
            update: {
              accessTokenEncrypted: encryptedPageToken,
              scopes: FACEBOOK_OAUTH_SCOPES,
              status: "active",
              tokenExpiresAt: null,
            },
            create: {
              businessId: state.businessId,
              platform: "facebook_page",
              externalAccountId: page.id,
              accessTokenEncrypted: encryptedPageToken,
              scopes: FACEBOOK_OAUTH_SCOPES,
              status: "active",
              tokenExpiresAt: null,
            },
          });

          if (page.instagramBusinessAccountId) {
            await options.prisma.socialAccount.upsert({
              where: {
                businessId_platform_externalAccountId: {
                  businessId: state.businessId,
                  platform: "instagram_business",
                  externalAccountId: page.instagramBusinessAccountId,
                },
              },
              update: {
                accessTokenEncrypted: encryptedPageToken,
                scopes: FACEBOOK_OAUTH_SCOPES,
                status: "active",
                tokenExpiresAt: null,
              },
              create: {
                businessId: state.businessId,
                platform: "instagram_business",
                externalAccountId: page.instagramBusinessAccountId,
                accessTokenEncrypted: encryptedPageToken,
                scopes: FACEBOOK_OAUTH_SCOPES,
                status: "active",
                tokenExpiresAt: null,
              },
            });
          }
        }

        return { connected: true, platform, pageCount: pages.length };
      }

      const shortLived = await exchangeThreadsCodeForToken(
        { appId: options.metaAppId, appSecret: options.metaAppSecret, redirectUri, code: query.code },
        options.threadsFetchImpl,
      );
      const longLived = await exchangeThreadsForLongLivedToken(
        { appSecret: options.metaAppSecret, shortLivedToken: shortLived.accessToken },
        options.threadsFetchImpl,
      );

      const encryptedToken = encryptToken(longLived.accessToken, options.tokenEncryptionKey);
      const tokenExpiresAt = longLived.expiresIn ? new Date(currentTime.getTime() + longLived.expiresIn * 1000) : null;

      await options.prisma.socialAccount.upsert({
        where: {
          businessId_platform_externalAccountId: {
            businessId: state.businessId,
            platform: "threads",
            externalAccountId: shortLived.userId,
          },
        },
        update: { accessTokenEncrypted: encryptedToken, scopes: THREADS_OAUTH_SCOPES, status: "active", tokenExpiresAt },
        create: {
          businessId: state.businessId,
          platform: "threads",
          externalAccountId: shortLived.userId,
          accessTokenEncrypted: encryptedToken,
          scopes: THREADS_OAUTH_SCOPES,
          status: "active",
          tokenExpiresAt,
        },
      });

      return { connected: true, platform };
    } catch (error) {
      request.log.error(error);
      await reply.code(502).send({ connected: false, error: "Failed to complete OAuth token exchange" });
      return;
    }
  });

  app.get("/oauth/status", async (request, reply) => {
    const user = await requireAuthenticatedUser(request, reply);
    if (!user) return;

    const business = await options.prisma.business.findFirst({ where: { telegramOwnerUserId: user.telegramUserId } });
    if (!business) {
      return { connected: [] };
    }

    const accounts = await options.prisma.socialAccount.findMany({ where: { businessId: business.id } });
    return {
      connected: accounts.map((account) => ({
        platform: account.platform,
        externalAccountId: account.externalAccountId,
        status: account.status,
      })),
    };
  });
}
