import type { GraphClient } from "../graph-client.js";

/**
 * Single-image publish to a Facebook Page's feed (see PLAN.md's M1 scope:
 * single-platform FB single-image publish). Multi-image carousels and
 * per-platform adaptation land in M2 (`adapt-post.ts`) — this call covers
 * exactly the `POST /{page-id}/photos` shape Meta uses for a one-photo post.
 */
export interface PublishPhotoParams {
  pageId: string;
  /** Page access token (not a user token) — required for `pages_manage_posts`. */
  pageAccessToken: string;
  /** Publicly reachable URL of the image; Graph API fetches it server-side. */
  imageUrl: string;
  /** Becomes the post's caption text when publishing directly to the feed. */
  caption?: string;
}

export interface PublishPhotoResult {
  /** The created photo's object id. */
  photoId: string;
  /** The feed post id (`{page-id}_{post-id}`), present when published (not left unpublished). */
  postId: string | null;
}

interface PublishPhotoResponse {
  id: string;
  post_id?: string;
}

export async function publishPhotoToFacebookPage(
  client: GraphClient,
  params: PublishPhotoParams,
): Promise<PublishPhotoResult> {
  const body: Record<string, unknown> = { url: params.imageUrl };
  if (params.caption !== undefined) {
    body.caption = params.caption;
  }

  const response = await client.post<PublishPhotoResponse>(`/${params.pageId}/photos`, body, params.pageAccessToken);

  return {
    photoId: response.data.id,
    postId: response.data.post_id ?? null,
  };
}
