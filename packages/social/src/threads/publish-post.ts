import type { GraphClient } from "../graph-client.js";

/**
 * Publish to a Threads user's profile (see PLAN.md's M2 scope: same adapter
 * interface shape as `facebook/publish-photo.ts` and
 * `instagram/publish-photo.ts`). Threads' Content Publishing API is a
 * two-step call like Instagram's: create a media container
 * (`POST /{threads-user-id}/threads`), then publish it
 * (`POST /{threads-user-id}/threads_publish`) — both calls use the Threads
 * user's own access token (Threads has its own OAuth grant, not a Page
 * token, per PLAN.md's OAuth section). The caller is responsible for
 * constructing `client` with `baseUrl: "https://graph.threads.net"` (this
 * function is host-agnostic, matching how `oauth.ts` treats Threads as a
 * different host from the rest of the Graph API).
 */
export interface PublishThreadsPostParams {
  threadsUserId: string;
  /** Threads user access token (from Threads' own OAuth grant, not a Page token). */
  accessToken: string;
  /** Post body text. Threads caps this at 500 characters (the binding per-platform limit per PLAN.md). */
  text?: string;
  /** Publicly reachable URL of the image; Graph API fetches it server-side. Omit for a text-only post. */
  imageUrl?: string;
}

export interface PublishThreadsPostResult {
  /** The published post's media id. */
  mediaId: string;
}

interface CreateThreadsContainerResponse {
  id: string;
}

interface PublishThreadsContainerResponse {
  id: string;
}

export async function publishThreadsPost(
  client: GraphClient,
  params: PublishThreadsPostParams,
): Promise<PublishThreadsPostResult> {
  const containerBody: Record<string, unknown> = {
    media_type: params.imageUrl !== undefined ? "IMAGE" : "TEXT",
  };
  if (params.text !== undefined) {
    containerBody.text = params.text;
  }
  if (params.imageUrl !== undefined) {
    containerBody.image_url = params.imageUrl;
  }

  const containerResponse = await client.post<CreateThreadsContainerResponse>(
    `/${params.threadsUserId}/threads`,
    containerBody,
    params.accessToken,
  );

  const publishResponse = await client.post<PublishThreadsContainerResponse>(
    `/${params.threadsUserId}/threads_publish`,
    { creation_id: containerResponse.data.id },
    params.accessToken,
  );

  return { mediaId: publishResponse.data.id };
}
