import type { Notification, Notifier } from "@studio/workflow";

export function createConsoleNotifier(): Notifier {
  return {
    channel: "email",
    async send(notification: Notification): Promise<void> {
      console.log(
        JSON.stringify(
          {
            type: "notification",
            to: notification.to,
            subject: notification.subject ?? null,
            body: notification.body,
          },
          null,
          2,
        ),
      );
    },
  };
}
