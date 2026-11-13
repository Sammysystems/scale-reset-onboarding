import type { IncomingMessage, ServerResponse } from "node:http";
import type { Engine } from "../src/engine.js";
import { startServer } from "../src/server.js";

const engine = {
  mode: "demo",
  modelName: "mock",
  project: "client-onboarding",
  store: {
    listRuns: async () => [],
    listSuspensions: async () => [],
    getRunDetail: async () => null,
  },
  run: async () => {
    throw new Error("workflow runner is not available on this deployment");
  },
  resume: async () => {
    throw new Error("workflow runner is not available on this deployment");
  },
  close: async () => {},
} as unknown as Engine;

let appPromise: ReturnType<typeof startServer> | null = null;

function app(): ReturnType<typeof startServer> {
  appPromise ??= startServer({
    engine,
    port: 0,
    host: "127.0.0.1",
    publicRoot: `${process.cwd()}/public`,
  });
  return appPromise;
}

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const handle = await app();
  handle.server.emit("request", req, res);
}

export const config = {
  runtime: "nodejs",
};
