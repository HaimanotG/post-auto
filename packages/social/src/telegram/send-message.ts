const TELEGRAM_API_BASE_URL = "https://api.telegram.org";

/**
 * Minimal Telegram Bot API `sendMessage` wrapper, used to push seller
 * notifications (reconnect-needed, publish failures, AI escalations to
 * needs_attention) per PLAN.md's OAuth and auto-reply pipeline sections --
 * previously only described there, never actually implemented. `chatId` is
 * the seller's `businesses.telegram_owner_user_id`; sendMessage works
 * against it directly since the seller has already started a chat with the
 * bot (required to open the Mini App in the first place).
 */
export interface SendTelegramMessageParams {
  botToken: string;
  chatId: string | number | bigint;
  text: string;
}

interface TelegramApiResponse {
  ok: boolean;
  description?: string;
}

export async function sendTelegramMessage(
  params: SendTelegramMessageParams,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const response = await fetchImpl(`${TELEGRAM_API_BASE_URL}/bot${params.botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: params.chatId.toString(), text: params.text }),
  });

  const body = (await response.json().catch(() => null)) as TelegramApiResponse | null;
  if (!response.ok || !body?.ok) {
    throw new Error(
      `Telegram sendMessage failed with status ${response.status}: ${body?.description ?? "unknown error"}`,
    );
  }
}
