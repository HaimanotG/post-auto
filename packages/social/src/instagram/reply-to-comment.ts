import type { GraphClient } from "../graph-client.js";

/**
 * Replies to an Instagram comment or mention (see PLAN.md's AI auto-reply
 * pipeline) via `POST /{ig-comment-id}/replies`, mirroring
 * facebook/reply-to-comment.ts's shape. Uses the Page access token for the
 * Page connected to this IG Business account, same as publish-photo.ts.
 */
export interface ReplyToInstagramCommentParams {
  commentId: string;
  pageAccessToken: string;
  message: string;
}

export interface ReplyToInstagramCommentResult {
  commentId: string;
}

interface ReplyToCommentResponse {
  id: string;
}

export async function replyToInstagramComment(
  client: GraphClient,
  params: ReplyToInstagramCommentParams,
): Promise<ReplyToInstagramCommentResult> {
  const response = await client.post<ReplyToCommentResponse>(
    `/${params.commentId}/replies`,
    { message: params.message },
    params.pageAccessToken,
  );
  return { commentId: response.data.id };
}
