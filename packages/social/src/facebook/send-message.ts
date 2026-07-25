import type { GraphClient } from "../graph-client.js";

/**
 * Sends a Messenger DM reply via the Send API (`POST /me/messages`), used
 * for facebook_page inbox_messages of type "dm" (see PLAN.md's AI auto-reply
 * pipeline). Requires the `pages_messaging` permission -- see
 * FACEBOOK_OAUTH_SCOPES in ../oauth.ts; a business connected before that
 * scope was added needs to reconnect Facebook before DM replies can work.
 */
export interface SendFacebookMessageParams {
  pageAccessToken: string;
  /** The sender's PSID (inbox_messages.sender_external_id). */
  recipientId: string;
  text: string;
}

export interface SendFacebookMessageResult {
  messageId: string;
}

interface SendMessageResponse {
  recipient_id: string;
  message_id: string;
}

export async function sendFacebookMessage(
  client: GraphClient,
  params: SendFacebookMessageParams,
): Promise<SendFacebookMessageResult> {
  const response = await client.post<SendMessageResponse>(
    "/me/messages",
    { recipient: { id: params.recipientId }, message: { text: params.text } },
    params.pageAccessToken,
  );
  return { messageId: response.data.message_id };
}
