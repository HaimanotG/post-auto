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
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  requireAuthenticatedUser,
  resolveOwnedBusiness,
  type BusinessContextStore,
} from "../lib/business-context.js";

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
  id: string;
  platform: Platform;
  externalAccountId: string;
  displayName: string | null;
  status: string;
}

interface SocialAccountWriteFields {
  accessTokenEncrypted: string;
  scopes: string[];
  status: "active";
  tokenExpiresAt: Date | null;
  displayName: string | null;
}

/**
 * Structural subset of PrismaClient this route needs, mirroring the narrow
 * interface pattern used by middleware/telegram-init-data.ts's
 * TelegramUserStore.
 */
export interface OAuthStore extends BusinessContextStore {
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
  /** Used to build the t.me/<bot>?startapp=oauth_success deep link on the "return to Telegram" screen. */
  telegramBotUsername?: string;
}

function buildRedirectUri(baseUrl: string, platform: OAuthInitiablePlatform): string {
  return `${baseUrl.replace(/\/+$/, "")}/oauth/${platform}/callback`;
}

/**
 * A WebView can't reliably postMessage back to the mini app after an
 * external-browser OAuth redirect (see PLAN.md's "Meta Graph API
 * integration" section), so the callback -- when hit by a real browser
 * navigation rather than a JSON API client -- renders a static "return to
 * Telegram" page with a t.me/<bot>?startapp=oauth_success deep link. The
 * mini app relaunches from that deep link and polls GET /oauth/status.
 */
function wantsHtmlResponse(request: FastifyRequest): boolean {
  const accept = request.headers.accept;
  return typeof accept === "string" && accept.includes("text/html");
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

function renderReturnToTelegramHtml(params: { connected: boolean; message: string; botUsername?: string }): string {
  const { connected, message, botUsername } = params;
  const deepLink = botUsername ? `https://t.me/${botUsername}?startapp=oauth_success` : undefined;
  const returnAction = deepLink
    ? `<p><a href="${escapeHtml(deepLink)}">Return to Telegram</a></p>`
    : `<p>Return to Telegram and reopen PostAuto.</p>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${connected ? "Connected" : "Connection failed"}</title>
</head>
<body>
<h1>${connected ? "You're connected!" : "Connection failed"}</h1>
<p>${escapeHtml(message)}</p>
${returnAction}
</body>
</html>`;
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
      const message = query.error_description ?? query.error ?? "Connection failed";
      if (wantsHtmlResponse(request)) {
        await reply.type("text/html").send(
          renderReturnToTelegramHtml({ connected: false, message, botUsername: options.telegramBotUsername }),
        );
        return;
      }
      return { connected: false, error: message };
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
              displayName: page.name,
            },
            create: {
              businessId: state.businessId,
              platform: "facebook_page",
              externalAccountId: page.id,
              accessTokenEncrypted: encryptedPageToken,
              scopes: FACEBOOK_OAUTH_SCOPES,
              status: "active",
              tokenExpiresAt: null,
              displayName: page.name,
            },
          });

          if (page.instagramBusinessAccountId) {
            const igDisplayName = page.instagramBusinessAccountUsername
              ? `@${page.instagramBusinessAccountUsername}`
              : null;
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
                displayName: igDisplayName,
              },
              create: {
                businessId: state.businessId,
                platform: "instagram_business",
                externalAccountId: page.instagramBusinessAccountId,
                accessTokenEncrypted: encryptedPageToken,
                scopes: FACEBOOK_OAUTH_SCOPES,
                status: "active",
                tokenExpiresAt: null,
                displayName: igDisplayName,
              },
            });
          }
        }

        if (wantsHtmlResponse(request)) {
          await reply.type("text/html").send(
            renderReturnToTelegramHtml({
              connected: true,
              message: `Connected ${pages.length} Facebook Page${pages.length === 1 ? "" : "s"}.`,
              botUsername: options.telegramBotUsername,
            }),
          );
          return;
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
        update: {
          accessTokenEncrypted: encryptedToken,
          scopes: THREADS_OAUTH_SCOPES,
          status: "active",
          tokenExpiresAt,
          // Threads' token exchange doesn't return a display name/handle.
          displayName: null,
        },
        create: {
          businessId: state.businessId,
          platform: "threads",
          externalAccountId: shortLived.userId,
          accessTokenEncrypted: encryptedToken,
          scopes: THREADS_OAUTH_SCOPES,
          status: "active",
          tokenExpiresAt,
          displayName: null,
        },
      });

      if (wantsHtmlResponse(request)) {
        await reply.type("text/html").send(
          renderReturnToTelegramHtml({
            connected: true,
            message: "Connected your Threads account.",
            botUsername: options.telegramBotUsername,
          }),
        );
        return;
      }
      return { connected: true, platform };
    } catch (error) {
      request.log.error(error);
      const message = "Failed to complete OAuth token exchange";
      if (wantsHtmlResponse(request)) {
        await reply
          .code(502)
          .type("text/html")
          .send(renderReturnToTelegramHtml({ connected: false, message, botUsername: options.telegramBotUsername }));
        return;
      }
      await reply.code(502).send({ connected: false, error: message });
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
        id: account.id,
        platform: account.platform,
        externalAccountId: account.externalAccountId,
        displayName: account.displayName,
        status: account.status,
      })),
    };
  });
}
