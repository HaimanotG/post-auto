import type { GraphClient } from "../graph-client.js";

/**
 * Multi-image publish to a Facebook Page's feed. A single `POST
 * /{page-id}/photos` call (see `publish-photo.ts`) always creates its own
 * standalone post, so a carousel needs Meta's "unpublished photo" pattern
 * instead: upload each image with `published=false` (returns a photo id but
 * creates no post), then create one feed post referencing all of them via
 * `attached_media`. Photos are uploaded sequentially -- a failure partway
 * through (e.g. the 3rd of 5 images) stops deterministically before creating
 * any feed post, rather than racing uploads and creating the feed post from
 * an unpredictable partial set. This doesn't clean up the photos already
 * uploaded before the failure -- they remain as harmless unpublished-photo
 * debris on Meta's side, never referenced by a post.
 */
export interface PublishCarouselParams {
  pageId: string;
  /** Page access token (not a user token) — required for `pages_manage_posts`. */
  pageAccessToken: string;
  /** Publicly reachable URLs of the images, in display order; Graph API fetches each server-side. Must contain at least 2 entries -- use publish-photo.ts for a single image. */
  imageUrls: string[];
  /** Becomes the feed post's caption text. */
  caption?: string;
}

export interface PublishCarouselResult {
  /** The created feed post's id (`{page-id}_{post-id}`). */
  postId: string;
}

interface UploadUnpublishedPhotoResponse {
  id: string;
}

interface CreateFeedPostResponse {
  id: string;
}

export async function publishCarouselToFacebookPage(
  client: GraphClient,
  params: PublishCarouselParams,
): Promise<PublishCarouselResult> {
  if (params.imageUrls.length < 2) {
    throw new Error("publishCarouselToFacebookPage requires at least 2 imageUrls");
  }

  const photoIds: string[] = [];
  for (const imageUrl of params.imageUrls) {
    const response = await client.post<UploadUnpublishedPhotoResponse>(
      `/${params.pageId}/photos`,
      { url: imageUrl, published: false },
      params.pageAccessToken,
    );
    photoIds.push(response.data.id);
  }

  const feedBody: Record<string, unknown> = {
    attached_media: photoIds.map((photoId) => ({ media_fbid: photoId })),
  };
  if (params.caption !== undefined) {
    feedBody.message = params.caption;
  }

  const feedResponse = await client.post<CreateFeedPostResponse>(`/${params.pageId}/feed`, feedBody, params.pageAccessToken);

  return { postId: feedResponse.data.id };
}
