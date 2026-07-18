import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthGate, type TelegramWebApp } from "../../app/AuthGate";
import { PostComposer } from "./PostComposer";

function setTelegramWebApp(webApp: Partial<TelegramWebApp> | undefined) {
  window.Telegram = webApp ? ({ WebApp: webApp } as unknown as Window["Telegram"]) : undefined;
}

function mockAuthenticatedFetch(onCreatePost: (request: Request) => Response | Promise<Response>) {
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
      if (request.url.endsWith("/posts") && request.method === "POST") {
        return onCreatePost(request);
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

  it("submits the caption and image URL to POST /posts", async () => {
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
    mockAuthenticatedFetch(onCreatePost);

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
    mockAuthenticatedFetch(() =>
      Promise.resolve(
        new Response(JSON.stringify({ id: "post_1", status: "draft", captionMaster: null, sourceAssets: [] }), {
          status: 201,
        }),
      ),
    );

    await renderComposer();

    expect(screen.getAllByLabelText("Image URL")).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Add another image" }));
    expect(screen.getAllByLabelText("Image URL")).toHaveLength(2);

    fireEvent.click(screen.getAllByRole("button", { name: "Remove image" })[0]!);
    expect(screen.getAllByLabelText("Image URL")).toHaveLength(1);
  });

  it("shows an error and does not submit when every image URL is blank", async () => {
    mockAuthenticatedFetch(() => {
      throw new Error("should not be called");
    });

    await renderComposer();

    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("At least one image URL is required");
    });
  });

  it("shows an error when the request fails", async () => {
    mockAuthenticatedFetch(() => Promise.resolve(new Response(null, { status: 500 })));

    await renderComposer();

    fireEvent.change(screen.getByLabelText("Image URL"), { target: { value: "https://cdn.test/tomatoes.jpg" } });
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Failed to save draft with status 500");
    });
  });
});
