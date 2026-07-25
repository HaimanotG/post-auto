import type { GraphClient } from "../graph-client.js";

/**
 * Replies to a Page comment or mention (see PLAN.md's AI auto-reply
 * pipeline) via `POST /{comment-id}/comments`, which creates a nested reply
 * comment attached to the original. Uses the Page access token, matching
 * publish-photo.ts's convention.
 */
export interface ReplyToFacebookCommentParams {
  /** The comment (or mention, which Meta represents as a comment) being replied to. */
  commentId: string;
  pageAccessToken: string;
  message: string;
}

export interface ReplyToFacebookCommentResult {
  /** The newly created reply comment's id. */
  commentId: string;
}

interface ReplyToCommentResponse {
  id: string;
}

export async function replyToFacebookComment(
  client: GraphClient,
  params: ReplyToFacebookCommentParams,
): Promise<ReplyToFacebookCommentResult> {
  const response = await client.post<ReplyToCommentResponse>(
    `/${params.commentId}/comments`,
    { message: params.message },
    params.pageAccessToken,
  );
  return { commentId: response.data.id };
}
