import { promises as fs } from "node:fs";
import path from "node:path";

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface EmailResult {
  delivered: boolean;
  mode: "resend" | "outbox";
  path?: string;
  error?: string;
}

export function extractEmail(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const match = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.exec(value);
  return match?.[0];
}

/**
 * Sends through Resend when configured, and always writes an outbox copy so the
 * operator has a local record and a preview even without an email provider.
 */
export async function sendEmail(
  message: EmailMessage,
  options: { outboxDir: string; env?: NodeJS.ProcessEnv; fetchImpl?: typeof fetch },
): Promise<EmailResult> {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? fetch;

  await fs.mkdir(options.outboxDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const base = path.join(options.outboxDir, stamp);
  await fs.writeFile(`${base}.html`, message.html, "utf8");
  await fs.writeFile(`${base}.txt`, `To: ${message.to}\nSubject: ${message.subject}\n\n${message.text}`, "utf8");

  const apiKey = env.RESEND_API_KEY;
  const from = env.RESEND_FROM;

  if (!apiKey || !from) {
    return { delivered: false, mode: "outbox", path: `${base}.html` };
  }

  try {
    const response = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
    });

    if (!response.ok) {
      return {
        delivered: false,
        mode: "resend",
        path: `${base}.html`,
        error: `Resend ${response.status}: ${await response.text()}`,
      };
    }

    return { delivered: true, mode: "resend", path: `${base}.html` };
  } catch (error) {
    return {
      delivered: false,
      mode: "resend",
      path: `${base}.html`,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
