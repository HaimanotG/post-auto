import type { GraphClient } from "./graph-client.js";

/**
 * Tells Meta which webhook fields to actually deliver for one connected
 * Page or IG Business account, via `POST /{id}/subscribed_apps` -- without
 * this call, GET/POST /webhooks/meta (routes/webhooks-meta.ts) never
 * receives any traffic for a newly connected account no matter how the App
 * Dashboard's Webhooks product is configured, since that only wires up the
 * *app*, not each individual Page/IG account. Same call shape for both
 * facebook_page (keyed by page id) and instagram_business (keyed by IG user
 * id) -- both use the Page access token.
 *
 * Deliberately has no Threads counterpart: the Threads Graph API
 * (graph.threads.net) has no `/{threads-user-id}/subscribed_apps`-equivalent
 * endpoint at all (confirmed against Meta's Threads webhooks reference,
 * developers.facebook.com/docs/threads/webhooks, and the Graph API explorer
 * -- `subscribed_apps` only exists on Pages/ad accounts/WABAs). Threads
 * webhook delivery is controlled entirely by (1) a one-time, app-level
 * "Get real-time notifications with Threads Webhooks" sub-use case
 * subscription configured once in the App Dashboard (not per connected
 * account, and not something this codebase can or needs to automate), and
 * (2) the connecting user granting the field's required permission scope
 * during OAuth -- e.g. the `replies` topic this app relies on for Threads
 * auto-reply needs `threads_basic` + `threads_read_replies`, both in
 * THREADS_OAUTH_SCOPES (see oauth.ts).
 */
export interface SubscribeToWebhooksParams {
  /** The Page id (facebook_page) or IG user id (instagram_business) to subscribe. */
  accountId: string;
  accessToken: string;
  subscribedFields: string[];
}

export interface SubscribeToWebhooksResult {
  success: boolean;
}

interface SubscribedAppsResponse {
  success: boolean;
}

/** feed: comments/reactions on Page posts. mention: the Page was @mentioned. messages: Messenger DMs. */
export const FACEBOOK_PAGE_WEBHOOK_FIELDS = ["feed", "mention", "messages"];

/** comments: comments on IG media. mentions: the IG account was @mentioned. messages: IG Direct DMs. */
export const INSTAGRAM_WEBHOOK_FIELDS = ["comments", "mentions", "messages"];

export async function subscribeToWebhooks(
  client: GraphClient,
  params: SubscribeToWebhooksParams,
): Promise<SubscribeToWebhooksResult> {
  const response = await client.post<SubscribedAppsResponse>(
    `/${params.accountId}/subscribed_apps`,
    { subscribed_fields: params.subscribedFields.join(",") },
    params.accessToken,
  );
  return { success: response.data.success };
}
