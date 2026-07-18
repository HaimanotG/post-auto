import type { GraphClient } from "../graph-client.js";

/**
 * Single-image publish to an Instagram Business account (see PLAN.md's M2
 * scope: multi-platform adaptation, same adapter interface shape as
 * `facebook/publish-photo.ts`). Unlike the Page photos endpoint, IG's
 * Content Publishing API is a two-step call: create a media container
 * (`POST /{ig-user-id}/media`), then publish it
 * (`POST /{ig-user-id}/media_publish`) — both calls use the Page access
 * token for the Page connected to this IG Business account (PLAN.md's
 * `GET /me/accounts` -> `instagram_business_account` linkage).
 */
export interface PublishInstagramPhotoParams {
  igUserId: string;
  /** Access token of the Page connected to this IG Business account. */
  pageAccessToken: string;
  /** Publicly reachable URL of the image; Graph API fetches it server-side. */
  imageUrl: string;
  /** Becomes the media's caption text when published. */
  caption?: string;
}

export interface PublishInstagramPhotoResult {
  /** The published media's object id. */
  mediaId: string;
}

interface CreateMediaContainerResponse {
  id: string;
}

interface PublishMediaContainerResponse {
  id: string;
}

export async function publishPhotoToInstagram(
  client: GraphClient,
  params: PublishInstagramPhotoParams,
): Promise<PublishInstagramPhotoResult> {
  const containerBody: Record<string, unknown> = { image_url: params.imageUrl };
  if (params.caption !== undefined) {
    containerBody.caption = params.caption;
  }

  const containerResponse = await client.post<CreateMediaContainerResponse>(
    `/${params.igUserId}/media`,
    containerBody,
    params.pageAccessToken,
  );

  const publishResponse = await client.post<PublishMediaContainerResponse>(
    `/${params.igUserId}/media_publish`,
    { creation_id: containerResponse.data.id },
    params.pageAccessToken,
  );

  return { mediaId: publishResponse.data.id };
}
