import { spawn } from "node:child_process";
import { createDiscoveryStore } from "./discovery-store.js";
import { createEngine } from "./engine.js";
import type { ProposalConfig } from "./proposal.js";
import { seedDemo } from "./seed.js";
import { startServer } from "./server.js";

function openBrowser(url: string): void {
  const platform = process.platform;

  try {
    if (platform === "win32") {
      const child = spawn("explorer.exe", [url], { detached: true, stdio: "ignore" });
      child.unref();
      return;
    }

    const command = platform === "darwin" ? "open" : "xdg-open";
    const child = spawn(command, [url], { detached: true, stdio: "ignore" });
    child.unref();
  } catch {
    // The URL is printed below regardless.
  }
}

const host = process.env.HOST ?? "127.0.0.1";
const port = Number(process.env.STUDIO_PORT ?? process.env.PORT ?? 8790);
const discoveryRoot = process.env.DISCOVERY_ROOT ?? ".data/discovery";

const config: ProposalConfig = {
  callUrl: process.env.CALL_URL ?? "",
  paymentUrl: process.env.PAYMENT_URL ?? "",
  whatsappUrl: process.env.WHATSAPP_URL ?? "",
};

const discovery = createDiscoveryStore(discoveryRoot);

if (process.argv.includes("--demo")) {
  const created = await seedDemo(discovery, config);
  if (created.length > 0) {
    console.log(
      JSON.stringify({ type: "seed-created", count: created.length, ids: created }),
    );
  }
}

const engine = await createEngine();
const server = await startServer({
  engine,
  discovery,
  host,
  port,
  proposalConfig: config,
  whatsappNumber: process.env.WHATSAPP_NUMBER,
  operatorEmail: process.env.OPERATOR_EMAIL,
});

const baseUrl = `http://${host}:${server.port}`;
console.log(`studio: ${baseUrl}`);
console.log(`admin:  ${baseUrl}/admin`);
if (!process.env.STUDIO_NO_OPEN) openBrowser(baseUrl);

async function shutdown(): Promise<void> {
  await server.close();
  await engine.close();
  process.exit(0);
}

process.on("SIGINT", () => {
  void shutdown();
});
process.on("SIGTERM", () => {
  void shutdown();
});
