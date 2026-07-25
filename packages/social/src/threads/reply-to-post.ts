import type { GraphClient } from "../graph-client.js";

/**
 * Replies to a Threads reply/post (see PLAN.md's AI auto-reply pipeline) --
 * the same two-step container-then-publish flow as threads/publish-post.ts,
 * with `reply_to_id` set so the created post attaches under the message
 * being replied to rather than starting a new top-level thread. The caller
 * is responsible for constructing `client` with
 * `baseUrl: "https://graph.threads.net"`, same as publish-post.ts.
 */
export interface ReplyToThreadsPostParams {
  threadsUserId: string;
  /** Threads user access token (from Threads' own OAuth grant, not a Page token). */
  accessToken: string;
  /** The post/reply id being replied to (inbox_messages.external_message_id). */
  replyToId: string;
  text: string;
}

export interface ReplyToThreadsPostResult {
  /** The published reply's media id. */
  mediaId: string;
}

interface CreateThreadsContainerResponse {
  id: string;
}

interface PublishThreadsContainerResponse {
  id: string;
}

export async function replyToThreadsPost(
  client: GraphClient,
  params: ReplyToThreadsPostParams,
): Promise<ReplyToThreadsPostResult> {
  const containerResponse = await client.post<CreateThreadsContainerResponse>(
    `/${params.threadsUserId}/threads`,
    { media_type: "TEXT", text: params.text, reply_to_id: params.replyToId },
    params.accessToken,
  );

  const publishResponse = await client.post<PublishThreadsContainerResponse>(
    `/${params.threadsUserId}/threads_publish`,
    { creation_id: containerResponse.data.id },
    params.accessToken,
  );

  return { mediaId: publishResponse.data.id };
}
