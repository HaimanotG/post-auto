import { buildGraphApiError } from "./errors.js";
import type { GraphClient } from "./graph-client.js";

/**
 * OAuth helpers for Meta's two separate grants (see PLAN.md's "Meta Graph
 * API integration" section): Facebook Login for Business covers
 * facebook_page + instagram_business (the IG Business account rides along
 * on the Page via `instagram_business_account`), while Threads has its own
 * OAuth authorize/token endpoints under a different host.
 */

const FACEBOOK_AUTHORIZE_URL = "https://www.facebook.com/v21.0/dialog/oauth";
const THREADS_AUTHORIZE_URL = "https://threads.net/oauth/authorize";
const THREADS_TOKEN_URL = "https://graph.threads.net/oauth/access_token";
const THREADS_LONG_LIVED_TOKEN_URL = "https://graph.threads.net/access_token";

export const FACEBOOK_OAUTH_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  "pages_manage_metadata",
  "instagram_basic",
  "instagram_content_publish",
  "instagram_manage_comments",
  "instagram_manage_messages",
  "business_management",
];

export const THREADS_OAUTH_SCOPES = [
  "threads_basic",
  "threads_content_publish",
  "threads_manage_replies",
  "threads_manage_insights",
];

export interface AuthorizationUrlParams {
  appId: string;
  redirectUri: string;
  state: string;
  scopes?: string[];
}

export function buildFacebookAuthorizationUrl(params: AuthorizationUrlParams): string {
  const url = new URL(FACEBOOK_AUTHORIZE_URL);
  url.searchParams.set("client_id", params.appId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("state", params.state);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", (params.scopes ?? FACEBOOK_OAUTH_SCOPES).join(","));
  return url.toString();
}

export function buildThreadsAuthorizationUrl(params: AuthorizationUrlParams): string {
  const url = new URL(THREADS_AUTHORIZE_URL);
  url.searchParams.set("client_id", params.appId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("state", params.state);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", (params.scopes ?? THREADS_OAUTH_SCOPES).join(","));
  return url.toString();
}

export interface FacebookCodeExchangeParams {
  appId: string;
  appSecret: string;
  redirectUri: string;
  code: string;
}

export interface OAuthTokenResult {
  accessToken: string;
  expiresIn?: number;
}

/** Exchanges the `code` from the Facebook Login redirect for a short-lived user access token. */
export async function exchangeFacebookCodeForToken(
  client: GraphClient,
  params: FacebookCodeExchangeParams,
): Promise<OAuthTokenResult> {
  const response = await client.get<{ access_token: string; token_type: string; expires_in?: number }>(
    "/oauth/access_token",
    {
      client_id: params.appId,
      client_secret: params.appSecret,
      redirect_uri: params.redirectUri,
      code: params.code,
    },
  );
  return { accessToken: response.data.access_token, expiresIn: response.data.expires_in };
}

export interface FacebookPageAccount {
  id: string;
  name: string;
  /** Page access token — also used to publish to the linked IG Business account. */
  accessToken: string;
  instagramBusinessAccountId?: string;
}

interface FacebookAccountsResponse {
  data: Array<{
    id: string;
    name: string;
    access_token: string;
    instagram_business_account?: { id: string };
  }>;
}

/** Lists the Pages (and their linked IG Business accounts, if any) the user granted access to. */
export async function fetchFacebookPageAccounts(
  client: GraphClient,
  userAccessToken: string,
): Promise<FacebookPageAccount[]> {
  const response = await client.get<FacebookAccountsResponse>(
    "/me/accounts",
    { fields: "id,name,access_token,instagram_business_account" },
    userAccessToken,
  );
  return response.data.data.map((page) => ({
    id: page.id,
    name: page.name,
    accessToken: page.access_token,
    instagramBusinessAccountId: page.instagram_business_account?.id,
  }));
}

export interface ThreadsCodeExchangeParams {
  appId: string;
  appSecret: string;
  redirectUri: string;
  code: string;
}

export interface ThreadsShortLivedToken {
  accessToken: string;
  userId: string;
}

type ThreadsFetch = typeof fetch;

async function parseThreadsJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * Threads' initial code exchange is a form-encoded POST to an unversioned
 * `graph.threads.net` endpoint — different enough from the rest of the Graph
 * API's JSON/query-string convention (see graph-client.ts) that it isn't
 * routed through GraphClient; fetchImpl is injectable for tests the same way
 * GraphClient injects it.
 */
export async function exchangeThreadsCodeForToken(
  params: ThreadsCodeExchangeParams,
  fetchImpl: ThreadsFetch = fetch,
): Promise<ThreadsShortLivedToken> {
  const body = new URLSearchParams({
    client_id: params.appId,
    client_secret: params.appSecret,
    grant_type: "authorization_code",
    redirect_uri: params.redirectUri,
    code: params.code,
  });

  const response = await fetchImpl(THREADS_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const json = await parseThreadsJson(response);

  if (!response.ok || typeof json !== "object" || json === null || !("access_token" in json)) {
    throw buildGraphApiError(response.status, json);
  }

  const parsed = json as { access_token: string; user_id: string | number };
  return { accessToken: parsed.access_token, userId: String(parsed.user_id) };
}

/** Exchanges a Threads short-lived token for a 60-day long-lived one via `th_exchange_token`. */
export async function exchangeThreadsForLongLivedToken(
  params: { appSecret: string; shortLivedToken: string },
  fetchImpl: ThreadsFetch = fetch,
): Promise<OAuthTokenResult> {
  const url = new URL(THREADS_LONG_LIVED_TOKEN_URL);
  url.searchParams.set("grant_type", "th_exchange_token");
  url.searchParams.set("client_secret", params.appSecret);
  url.searchParams.set("access_token", params.shortLivedToken);

  const response = await fetchImpl(url.toString());
  const json = await parseThreadsJson(response);

  if (!response.ok || typeof json !== "object" || json === null || !("access_token" in json)) {
    throw buildGraphApiError(response.status, json);
  }

  const parsed = json as { access_token: string; token_type: string; expires_in?: number };
  return { accessToken: parsed.access_token, expiresIn: parsed.expires_in };
}
