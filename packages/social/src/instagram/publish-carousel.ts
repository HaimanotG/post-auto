import type { GraphClient } from "../graph-client.js";

/**
 * Multi-image publish to an Instagram Business account. IG's Content
 * Publishing API models a carousel as three steps: create one "item"
 * container per image (`POST /{ig-user-id}/media` with
 * `is_carousel_item=true`, no caption on the item itself), create a parent
 * `CAROUSEL` container referencing all the item ids via `children`, then
 * publish the parent (`POST /{ig-user-id}/media_publish`) same as a single
 * photo. Items are created sequentially -- see publish-carousel.ts's
 * Facebook counterpart for why (deterministic stop before creating the
 * parent container on partial failure, not cleanup of items already
 * created).
 */
export interface PublishInstagramCarouselParams {
  igUserId: string;
  /** Access token of the Page connected to this IG Business account. */
  pageAccessToken: string;
  /** Publicly reachable URLs of the images, in display order; Graph API fetches each server-side. Must contain at least 2 entries (IG's cap is 10) -- use publish-photo.ts for a single image. */
  imageUrls: string[];
  /** Becomes the published carousel's caption text. */
  caption?: string;
}

export interface PublishInstagramCarouselResult {
  /** The published carousel's object id. */
  mediaId: string;
}

interface CreateMediaContainerResponse {
  id: string;
}

interface PublishMediaContainerResponse {
  id: string;
}

export async function publishCarouselToInstagram(
  client: GraphClient,
  params: PublishInstagramCarouselParams,
): Promise<PublishInstagramCarouselResult> {
  if (params.imageUrls.length < 2) {
    throw new Error("publishCarouselToInstagram requires at least 2 imageUrls");
  }

  const itemIds: string[] = [];
  for (const imageUrl of params.imageUrls) {
    const response = await client.post<CreateMediaContainerResponse>(
      `/${params.igUserId}/media`,
      { image_url: imageUrl, is_carousel_item: true },
      params.pageAccessToken,
    );
    itemIds.push(response.data.id);
  }

  const carouselBody: Record<string, unknown> = {
    media_type: "CAROUSEL",
    children: itemIds.join(","),
  };
  if (params.caption !== undefined) {
    carouselBody.caption = params.caption;
  }

  const carouselResponse = await client.post<CreateMediaContainerResponse>(
    `/${params.igUserId}/media`,
    carouselBody,
    params.pageAccessToken,
  );

  const publishResponse = await client.post<PublishMediaContainerResponse>(
    `/${params.igUserId}/media_publish`,
    { creation_id: carouselResponse.data.id },
    params.pageAccessToken,
  );

  return { mediaId: publishResponse.data.id };
}
