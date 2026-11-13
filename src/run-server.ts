import { createEngine } from "./engine.js";
import { startServer } from "./server.js";

const engine = await createEngine();
const server = await startServer({ engine });

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
