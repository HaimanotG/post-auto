import type { GraphClient } from "../graph-client.js";

/**
 * Sends an Instagram Direct reply via the Messenger Platform's IG Send API
 * (`POST /{ig-user-id}/messages`), used for instagram_business
 * inbox_messages of type "dm" (see PLAN.md's AI auto-reply pipeline).
 * Requires `instagram_manage_messages` (already in FACEBOOK_OAUTH_SCOPES).
 */
export interface SendInstagramMessageParams {
  igUserId: string;
  pageAccessToken: string;
  /** The sender's IGSID (inbox_messages.sender_external_id). */
  recipientId: string;
  text: string;
}

export interface SendInstagramMessageResult {
  messageId: string;
}

interface SendMessageResponse {
  recipient_id: string;
  message_id: string;
}

export async function sendInstagramMessage(
  client: GraphClient,
  params: SendInstagramMessageParams,
): Promise<SendInstagramMessageResult> {
  const response = await client.post<SendMessageResponse>(
    `/${params.igUserId}/messages`,
    { recipient: { id: params.recipientId }, message: { text: params.text } },
    params.pageAccessToken,
  );
  return { messageId: response.data.message_id };
}
