import "server-only";

/**
 * Kirim pesan lewat Telegram Bot API (resmi, gratis, tidak perlu approval).
 * Setup: chat dengan @BotFather -> /newbot -> catat token -> tambahkan bot ke
 * grup pengawas -> catat chat_id grup (mis. lewat https://api.telegram.org/bot<token>/getUpdates).
 */
export async function sendTelegramMessage(botToken: string, chatId: string, message: string) {
  const endpoint = `https://api.telegram.org/bot${botToken}/sendMessage`;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: message,
      parse_mode: "HTML",
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Gagal mengirim Telegram (${res.status}): ${text}`);
  }
}
