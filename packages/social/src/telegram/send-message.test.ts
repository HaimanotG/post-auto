import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { sendTelegramMessage } from "./send-message.js";

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("sendTelegramMessage", () => {
  it("posts to the bot's sendMessage endpoint with a stringified chat id", async () => {
    let capturedBody: unknown;
    server.use(
      http.post("https://api.telegram.org/bot123:abc/sendMessage", async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({ ok: true, result: {} });
      }),
    );

    await sendTelegramMessage({ botToken: "123:abc", chatId: 987654321n, text: "Reconnect Threads to keep posting." });

    expect(capturedBody).toEqual({ chat_id: "987654321", text: "Reconnect Threads to keep posting." });
  });

  it("throws when Telegram reports ok: false", async () => {
    server.use(
      http.post("https://api.telegram.org/bot123:abc/sendMessage", () =>
        HttpResponse.json({ ok: false, description: "chat not found" }, { status: 400 }),
      ),
    );

    const error = await sendTelegramMessage({ botToken: "123:abc", chatId: "1", text: "hi" }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("chat not found");
  });
});
