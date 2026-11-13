import type { Notifier } from "@studio/workflow";
import { createConsoleNotifier } from "./console.js";
import { createTelegramNotifier } from "./telegram.js";

export function createNotifierFromEnv(env: NodeJS.ProcessEnv = process.env): Notifier {
  const mode = (env.NOTIFIER ?? "console").toLowerCase();

  if (mode === "telegram") {
    const botToken = env.TELEGRAM_BOT_TOKEN;
    const chatId = env.TELEGRAM_CHAT_ID;

    if (!botToken || !chatId) {
      throw new Error(
        "TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are required when NOTIFIER=telegram",
      );
    }

    return createTelegramNotifier({ botToken, chatId });
  }

  return createConsoleNotifier();
}

export { createConsoleNotifier, createTelegramNotifier };
