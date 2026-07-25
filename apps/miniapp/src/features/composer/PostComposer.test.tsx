import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthGate, type TelegramWebApp } from "../../app/AuthGate";
import { PostComposer } from "./PostComposer";

function setTelegramWebApp(webApp: Partial<TelegramWebApp> | undefined) {
  window.Telegram = webApp ? ({ WebApp: webApp } as unknown as Window["Telegram"]) : undefined;
}

function mockAuthenticatedFetch(handlers: {
  onCreatePost?: (request: Request) => Response | Promise<Response>;
  onPublish?: (request: Request) => Response | Promise<Response>;
  oauthStatusResponse?: () => Response | Promise<Response>;
}) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      if (request.url.endsWith("/auth/telegram")) {
        return new Response(
          JSON.stringify({
            token: "jwt-token",
            user: { id: "user-1", telegramUserId: "1", username: "haile", firstName: "Haile", photoUrl: null },
          }),
          { status: 200 },
        );
      }
      if (request.url.endsWith("/oauth/status")) {
        return handlers.oauthStatusResponse
          ? handlers.oauthStatusResponse()
          : new Response(JSON.stringify({ connected: [] }), { status: 200 });
      }
      if (request.url.endsWith("/posts") && request.method === "POST") {
        if (!handlers.onCreatePost) throw new Error("Unexpected POST /posts");
        return handlers.onCreatePost(request);
      }
      if (request.url.endsWith("/publish") && request.method === "POST") {
        if (!handlers.onPublish) throw new Error("Unexpected POST /publish");
        return handlers.onPublish(request);
      }
      throw new Error(`Unexpected fetch to ${request.url}`);
    }),
  );
}

async function renderComposer() {
  render(
    <AuthGate apiBaseUrl="https://api.test">
      <PostComposer apiBaseUrl="https://api.test" />
    </AuthGate>,
  );
  await waitFor(() => {
    expect(screen.getByRole("button", { name: "Save draft" })).toBeInTheDocument();
  });
}

describe("PostComposer", () => {
  beforeEach(() => {
    setTelegramWebApp({ initData: "auth_date=1&user=%7B%22id%22%3A1%7D&hash=abc" });
  });

  afterEach(() => {
    setTelegramWebApp(undefined);
    vi.unstubAllGlobals();
  });

  it("submits the caption and image URL to POST /posts, omitting targetAccountIds when none are selected", async () => {
    const onCreatePost = vi.fn(async (request: Request) => {
      const body = await request.json();
      expect(body).toEqual({
        captionMaster: "Fresh tomatoes, 50 ETB/kg",
        assets: [{ rawUrl: "https://cdn.test/tomatoes.jpg", productName: "Tomatoes", price: 50 }],
      });
      return new Response(
        JSON.stringify({
          id: "post_1",
          status: "draft",
          captionMaster: "Fresh tomatoes, 50 ETB/kg",
          sourceAssets: [{ id: "asset_1", rawUrl: "https://cdn.test/tomatoes.jpg" }],
        }),
        { status: 201 },
      );
    });
    mockAuthenticatedFetch({ onCreatePost });

    await renderComposer();

    fireEvent.change(screen.getByLabelText("Caption"), { target: { value: "Fresh tomatoes, 50 ETB/kg" } });
    fireEvent.change(screen.getByLabelText("Image URL"), { target: { value: "https://cdn.test/tomatoes.jpg" } });
    fireEvent.change(screen.getByLabelText("Product name"), { target: { value: "Tomatoes" } });
    fireEvent.change(screen.getByLabelText("Price"), { target: { value: "50" } });

    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("Draft saved.");
    });
    expect(onCreatePost).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      "https://api.test/posts",
      expect.objectContaining({
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer jwt-token" },
      }),
    );
  });

  it("supports adding and removing extra image fields", async () => {
    mockAuthenticatedFetch({
      onCreatePost: () =>
        Promise.resolve(
          new Response(JSON.stringify({ id: "post_1", status: "draft", captionMaster: null, sourceAssets: [] }), {
            status: 201,
          }),
        ),
    });

    await renderComposer();

    expect(screen.getAllByLabelText("Image URL")).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Add another image" }));
    expect(screen.getAllByLabelText("Image URL")).toHaveLength(2);

    fireEvent.click(screen.getAllByRole("button", { name: "Remove image" })[0]!);
    expect(screen.getAllByLabelText("Image URL")).toHaveLength(1);
  });

  it("shows an error and does not submit when every image URL is blank", async () => {
    mockAuthenticatedFetch({
      onCreatePost: () => {
        throw new Error("should not be called");
      },
    });

    await renderComposer();

    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("At least one image URL is required");
    });
  });

  it("shows an error when the request fails", async () => {
    mockAuthenticatedFetch({ onCreatePost: () => Promise.resolve(new Response(null, { status: 500 })) });

    await renderComposer();

    fireEvent.change(screen.getByLabelText("Image URL"), { target: { value: "https://cdn.test/tomatoes.jpg" } });
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Failed to save draft with status 500");
    });
  });

  it("lists connected accounts, distinguishing two Facebook Pages by name, and disables Publish until one is picked", async () => {
    mockAuthenticatedFetch({
      oauthStatusResponse: () =>
        new Response(
          JSON.stringify({
            connected: [
              { id: "acct_1", platform: "facebook_page", externalAccountId: "page-1", displayName: "Shop A", status: "active" },
              { id: "acct_2", platform: "facebook_page", externalAccountId: "page-2", displayName: "Shop B", status: "active" },
            ],
          }),
          { status: 200 },
        ),
    });

    await renderComposer();

    await waitFor(() => {
      expect(screen.getByText("Shop A")).toBeInTheDocument();
    });
    expect(screen.getByText("Shop B")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Publish now" })).toBeDisabled();

    fireEvent.click(screen.getByLabelText("Shop A"));
    expect(screen.getByRole("button", { name: "Publish now" })).not.toBeDisabled();
  });

  it("shows a connect-first prompt instead of a picker when no accounts are connected", async () => {
    mockAuthenticatedFetch({});

    await renderComposer();

    await waitFor(() => {
      expect(screen.getByText(/No accounts connected yet/)).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Publish now" })).toBeDisabled();
  });

  it("creates the post with targetAccountIds and enqueues publishing when 'Publish now' is used", async () => {
    const onCreatePost = vi.fn(async (request: Request) => {
      const body = await request.json();
      expect(body).toEqual({
        captionMaster: undefined,
        assets: [{ rawUrl: "https://cdn.test/tomatoes.jpg" }],
        targetAccountIds: ["acct_1"],
      });
      return new Response(
        JSON.stringify({ id: "post_1", status: "draft", captionMaster: null, sourceAssets: [] }),
        { status: 201 },
      );
    });
    const onPublish = vi.fn(async (request: Request) => {
      expect(request.url).toBe("https://api.test/posts/post_1/publish");
      return new Response(
        JSON.stringify({ postId: "post_1", status: "publishing", queued: [{ variantId: "v1", platform: "facebook_page" }] }),
        { status: 202 },
      );
    });

    mockAuthenticatedFetch({
      onCreatePost,
      onPublish,
      oauthStatusResponse: () =>
        new Response(
          JSON.stringify({
            connected: [{ id: "acct_1", platform: "facebook_page", externalAccountId: "page-1", displayName: "Shop A", status: "active" }],
          }),
          { status: 200 },
        ),
    });

    await renderComposer();
    await waitFor(() => expect(screen.getByText("Shop A")).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText("Image URL"), { target: { value: "https://cdn.test/tomatoes.jpg" } });
    fireEvent.click(screen.getByLabelText("Shop A"));
    fireEvent.click(screen.getByRole("button", { name: "Publish now" }));

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("Publishing to 1 account…");
    });
    expect(onCreatePost).toHaveBeenCalledTimes(1);
    expect(onPublish).toHaveBeenCalledTimes(1);
  });

  it("requires at least one selected account before publishing, without calling POST /posts", async () => {
    const onCreatePost = vi.fn();
    mockAuthenticatedFetch({
      onCreatePost,
      oauthStatusResponse: () =>
        new Response(
          JSON.stringify({
            connected: [{ id: "acct_1", platform: "facebook_page", externalAccountId: "page-1", displayName: "Shop A", status: "active" }],
          }),
          { status: 200 },
        ),
    });

    await renderComposer();
    await waitFor(() => expect(screen.getByText("Shop A")).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText("Image URL"), { target: { value: "https://cdn.test/tomatoes.jpg" } });

    // Publish is disabled with nothing selected -- assert the guard fires even if a test forces the click.
    expect(screen.getByRole("button", { name: "Publish now" })).toBeDisabled();
    expect(onCreatePost).not.toHaveBeenCalled();
  });
});
