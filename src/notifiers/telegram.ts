import type { Notification, Notifier } from "@studio/workflow";

export interface TelegramNotifierOptions {
  botToken: string;
  chatId: string;
  fetchImpl?: typeof fetch;
}

export function createTelegramNotifier(options: TelegramNotifierOptions): Notifier {
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    channel: "telegram",
    async send(notification: Notification): Promise<void> {
      const text = [notification.subject, notification.body].filter(Boolean).join("\n\n");

      const response = await fetchImpl(
        `https://api.telegram.org/bot${options.botToken}/sendMessage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: options.chatId,
            text,
            disable_web_page_preview: true,
          }),
        },
      );

      if (!response.ok) {
        throw new Error(`Telegram error ${response.status}: ${await response.text()}`);
      }
    },
  };
}
