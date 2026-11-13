import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Notification, Notifier } from "@studio/workflow";
import { createEngine } from "../src/engine.js";
import type { Engine } from "../src/engine.js";
import { startServer } from "../src/server.js";
import type { ServerHandle } from "../src/server.js";
import type { IntakeInput } from "../src/types.js";

const intake: IntakeInput = {
  clientName: "Kestrel Legal",
  industry: "boutique law",
  form: {
    businessDescription:
      "A two-solicitor boutique handling commercial contracts and small disputes for owner-run businesses.",
    targetAudience:
      "Owner-run businesses with 5-50 staff that need contract review without a full in-house legal team.",
    brandPersonality:
      "Direct, unflappable, plain-English. We name the risk and the next step in the same breath.",
    competitors:
      "Larger regional firms that bill by the hour and a few fixed-fee online contract services.",
    goals:
      "Turn website enquiries into booked consultations within one working day and cut repeated screening calls.",
  },
  source: "test",
};

let engine: Engine;
let server: ServerHandle;
let sent: Notification[];
let workdir: string;

beforeEach(async () => {
  workdir = await fs.mkdtemp(path.join(os.tmpdir(), "onboarding-server-"));
  sent = [];
  const notifier: Notifier = {
    channel: "email",
    async send(notification) {
      sent.push(notification);
    },
  };
  engine = await createEngine({
    notifier,
    deliverablesRoot: path.join(workdir, "deliverables"),
    dataRoot: path.join(workdir, "data"),
    autoApprove: false,
  });
  server = await startServer({ engine, port: 0, host: "127.0.0.1" });
});

afterEach(async () => {
  await server.close();
  await engine.close();
  await fs.rm(workdir, { recursive: true, force: true });
});

function url(pathname: string): string {
  return `http://127.0.0.1:${server.port}${pathname}`;
}

describe("onboarding HTTP surface", () => {
  it("reports health", async () => {
    const response = await fetch(url("/health"));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok: boolean; workflowId: string };
    expect(body.ok).toBe(true);
    expect(body.workflowId).toBe("client-onboarding-research");
  });

  it("accepts an intake, lists the suspension, and resumes to completion", async () => {
    const created = await fetch(url("/webhooks/intake"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(intake),
    });
    expect(created.status).toBe(202);

    const start = (await created.json()) as {
      executionId: string;
      status: string;
      suspension: { reason: string } | null;
    };
    expect(start.status).toBe("suspended");
    expect(start.suspension?.reason).toContain("approval");

    const suspensions = (await (await fetch(url("/suspensions"))).json()) as {
      suspensions: Array<{ runId: string }>;
    };
    expect(suspensions.suspensions.map((row) => row.runId)).toContain(start.executionId);

    const detail = await fetch(url(`/runs/${start.executionId}`));
    expect(detail.status).toBe(200);
    const detailBody = (await detail.json()) as {
      steps: Array<{ stepId: string }>;
      run: { workflowId: string };
    };
    expect(detailBody.steps.map((step) => step.stepId)).toContain("approval");
    expect(detailBody.run.workflowId).toBe("client-onboarding-research");

    const resumed = await fetch(url(`/runs/${start.executionId}/resume`), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "approve", decidedBy: "tester" }),
    });
    expect(resumed.status).toBe(200);
    const done = (await resumed.json()) as {
      status: string;
      result: { status: string; documents: Array<{ path: string }> };
    };
    expect(done.status).toBe("completed");
    expect(done.result.status).toBe("approved");
    expect(done.result.documents).toHaveLength(3);
    for (const document of done.result.documents) {
      await expect(fs.access(document.path)).resolves.toBeUndefined();
    }
  });

  it("rejects a malformed intake with a validation error", async () => {
    const response = await fetch(url("/webhooks/intake"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ industry: "no name" }),
    });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("invalid_input");
  });

  it("returns 404 for an unknown run", async () => {
    const response = await fetch(url("/runs/does-not-exist"));
    expect(response.status).toBe(404);
  });

  it("serves nested font assets under /assets", async () => {
    const css = await fetch(url("/assets/fonts.css"));
    expect(css.status).toBe(200);
    const font = await fetch(url("/assets/fonts/archivo-var-latin.woff2"));
    expect(font.status).toBe(200);
    expect(font.headers.get("content-type")).toContain("font");
  });
});
