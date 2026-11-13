import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Notification, Notifier } from "@studio/workflow";
import { MemoryDiscoveryStore } from "../src/discovery-store.js";
import { createEngine } from "../src/engine.js";
import type { Engine } from "../src/engine.js";
import { startServer } from "../src/server.js";
import type { ServerHandle } from "../src/server.js";

const ADMIN_TOKEN = "test-admin-token";
const ADMIN_HEADERS = { "content-type": "application/json", "x-admin-token": ADMIN_TOKEN };

const STEP_VALUES: Record<string, Record<string, string | string[]>> = {
  business: {
    businessName: "Lagos Bloom Studio",
    industry: "Creative studio",
    location: "Lekki, Lagos",
    website: "@lagosbloom",
  },
  work: {
    offer: "plan and style small weddings and corporate events",
    customer: "busy professionals in Lagos",
    outcome: "one team to handle design, vendors, and setup",
  },
  week: {
    timeSinks: ["Replying to new enquiries", "Booking appointments and reminders"],
    tools: ["WhatsApp", "Instagram DMs", "Google Sheets / Excel"],
    attempts: "Tried a tool",
  },
  bottleneck: {
    bottleneck: "Replying to new enquiries",
    frequency: "Several times a day",
    timeCost: "15–60 minutes",
    costOfFailure: "We lose bookings to studios that answer faster",
  },
};

const CONTACT = { name: "Ada Okafor", email: "ada@lagosbloom.com", phone: "0803 555 0142" };

let engine: Engine;
let server: ServerHandle;
let discovery: MemoryDiscoveryStore;
let workdir: string;

beforeEach(async () => {
  workdir = await fs.mkdtemp(path.join(os.tmpdir(), "discovery-api-"));
  const sent: Notification[] = [];
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
  discovery = new MemoryDiscoveryStore();
  server = await startServer({
    engine,
    discovery,
    port: 0,
    host: "127.0.0.1",
    runnerToken: "",
    adminToken: ADMIN_TOKEN,
    outboxDir: path.join(workdir, "outbox"),
    proposalConfig: {
      callUrl: "https://wa.me/2348035248296",
      paymentUrl: "https://pay.example/setup",
      whatsappUrl: "",
    },
  });
});

afterEach(async () => {
  await server.close();
  await engine.close();
  await fs.rm(workdir, { recursive: true, force: true });
});

function url(pathname: string): string {
  return `http://127.0.0.1:${server.port}${pathname}`;
}

type SessionBody = {
  id: string;
  status: string;
  total: number;
  answered: number;
  pending: string[];
  currentStep: { id: string } | null;
  stepBank: unknown[];
  proposal: Record<string, unknown> | null;
  proposalReady: boolean;
  contact: Record<string, string> | null;
  call: { status: string; startTime?: string; source?: string };
  whatsappUrl: string;
  needsCall: boolean;
  thinSteps: string[];
};

async function startSession(): Promise<SessionBody> {
  const response = await fetch(url("/api/discovery/start"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  expect(response.status).toBe(201);
  return (await response.json()) as SessionBody;
}

async function submitStep(
  id: string,
  stepId: string,
  values: Record<string, string | string[]>,
  explainOnCall = false,
): Promise<SessionBody> {
  const response = await fetch(url(`/api/discovery/${id}/step`), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ stepId, values, explainOnCall }),
  });
  expect(response.status, `step ${stepId}`).toBe(200);
  return (await response.json()) as SessionBody;
}

async function answerAll(id: string): Promise<SessionBody> {
  let last: SessionBody | null = null;
  for (const stepId of ["business", "work", "week", "bottleneck"]) {
    last = await submitStep(id, stepId, STEP_VALUES[stepId]!);
  }
  return last!;
}

async function sendContact(id: string): Promise<SessionBody> {
  const response = await fetch(url(`/api/discovery/${id}/contact`), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(CONTACT),
  });
  expect(response.status).toBe(200);
  return (await response.json()) as SessionBody;
}

async function requestBooking(id: string, preferred = ""): Promise<SessionBody> {
  const response = await fetch(url(`/api/discovery/${id}/request-call`), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ preferred }),
  });
  expect(response.status).toBe(200);
  return (await response.json()) as SessionBody;
}

describe("discovery API", () => {
  it("starts on business with a hidden proposal", async () => {
    const session = await startSession();
    expect(session.id.startsWith("disc_")).toBe(true);
    expect(session.status).toBe("in_progress");
    expect(session.currentStep?.id).toBe("business");
    expect(session.total).toBe(4);
    expect(session.stepBank).toHaveLength(4);
    expect(session.proposal).toBeNull();
    expect(session.proposalReady).toBe(false);
    expect(session.whatsappUrl).toContain("https://wa.me/2348035248296");
  });

  it("rejects an out-of-order step", async () => {
    const session = await startSession();
    const response = await fetch(url(`/api/discovery/${session.id}/step`), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ stepId: "week", values: STEP_VALUES.week }),
    });
    expect(response.status).toBe(409);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("out_of_order");
  });

  it("blocks thin answers but accepts explain-on-the-call", async () => {
    const session = await startSession();
    const rejected = await fetch(url(`/api/discovery/${session.id}/step`), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        stepId: "business",
        values: { businessName: "asdf", industry: "Creative studio", location: "test" },
      }),
    });
    expect(rejected.status).toBe(400);
    const rejectedBody = (await rejected.json()) as { error: string; errors: Record<string, string> };
    expect(rejectedBody.error).toBe("invalid_step");
    expect(rejectedBody.errors.businessName).toBeTruthy();

    const explained = await submitStep(session.id, "business", {}, true);
    expect(explained.needsCall).toBe(true);
    expect(explained.thinSteps).toContain("business");
    expect(explained.status).toBe("in_progress");
  });

  it("walks four steps to the booking gate with no public proposal", async () => {
    const session = await startSession();
    const done = await answerAll(session.id);
    expect(done.status).toBe("booking");
    expect(done.currentStep).toBeNull();
    expect(done.pending).toEqual([]);
    expect(done.answered).toBe(4);
    expect(done.proposal).toBeNull();
    expect(done.proposalReady).toBe(false);
    expect(done.needsCall).toBe(false);
  });

  it("captures contact, opens the WhatsApp booking, and keeps the draft hidden", async () => {
    const session = await startSession();
    await answerAll(session.id);

    const contacted = await sendContact(session.id);
    expect(contacted.contact?.email).toBe(CONTACT.email);

    const booked = await requestBooking(session.id);
    expect(booked.status).toBe("call_booked");
    expect(booked.call.status).toBe("requested");
    expect(booked.call.source).toBe("whatsapp");
    expect(booked.proposal).toBeNull();
    expect(booked.proposalReady).toBe(false);
  });

  it("validates contact details", async () => {
    const session = await startSession();
    await answerAll(session.id);
    const response = await fetch(url(`/api/discovery/${session.id}/contact`), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "A" }),
    });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("invalid_contact");
  });

  it("requests a time when no calendar is configured", async () => {
    const session = await startSession();
    await answerAll(session.id);
    await sendContact(session.id);

    const response = await fetch(url(`/api/discovery/${session.id}/request-call`), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ preferred: "Tuesday afternoon, Lagos time" }),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as SessionBody;
    expect(body.status).toBe("call_booked");
    expect(body.call.status).toBe("requested");
    expect(body.call.source).toBe("whatsapp");
    expect(body.proposal).toBeNull();
  });

  it("gates admin routes and drives call-done, approve, send, paid, onboard", async () => {
    const session = await startSession();
    await answerAll(session.id);
    await sendContact(session.id);
    await requestBooking(session.id);

    const denied = await fetch(url("/api/admin/discoveries"));
    expect(denied.status).toBe(401);

    const list = await fetch(url("/api/admin/discoveries"), {
      headers: { "x-admin-token": ADMIN_TOKEN },
    });
    expect(list.status).toBe(200);
    const listBody = (await list.json()) as { discoveries: Array<{ id: string }> };
    expect(listBody.discoveries.map((row) => row.id)).toContain(session.id);

    const detail = await fetch(url(`/api/admin/discoveries/${session.id}`), {
      headers: { "x-admin-token": ADMIN_TOKEN },
    });
    expect(detail.status).toBe(200);
    const detailBody = (await detail.json()) as {
      proposalSource: string;
      callNotes: string | null;
      contactLabel: string;
    };
    expect(detailBody.proposalSource).toBe("pre_call");
    expect(detailBody.callNotes).toBeNull();
    expect(detailBody.contactLabel).toContain("Ada Okafor");

    const premature = await fetch(url(`/api/admin/discoveries/${session.id}/send`), {
      method: "POST",
      headers: ADMIN_HEADERS,
      body: "{}",
    });
    expect(premature.status).toBe(409);
    expect(((await premature.json()) as { error: string }).error).toBe("proposal_not_approved");

    const called = await fetch(url(`/api/admin/discoveries/${session.id}/call-done`), {
      method: "POST",
      headers: ADMIN_HEADERS,
      body: JSON.stringify({
        notes: "Confirmed the reply window. Approval stays with Ada for custom replies.",
        decidedBy: "tester",
      }),
    });
    expect(called.status).toBe(200);
    const calledBody = (await called.json()) as {
      status: string;
      proposalSource: string;
      proposal: { source: string; assumptions: string[] };
    };
    expect(calledBody.status).toBe("proposal_ready");
    expect(calledBody.proposalSource).toBe("post_call");
    expect(calledBody.proposal.source).toBe("post_call");
    expect(calledBody.proposal.assumptions.join(" ")).toContain("discussed on the call");

    const publicNow = await fetch(url(`/api/discovery/${session.id}`));
    const publicBody = (await publicNow.json()) as SessionBody;
    expect(publicBody.proposalReady).toBe(true);
    expect(publicBody.proposal).not.toBeNull();

    const approved = await fetch(url(`/api/admin/discoveries/${session.id}/approve`), {
      method: "POST",
      headers: ADMIN_HEADERS,
      body: JSON.stringify({ decidedBy: "tester", notes: "Scope looks right." }),
    });
    expect(approved.status).toBe(200);
    expect(((await approved.json()) as { status: string }).status).toBe("approved");

    const sent = await fetch(url(`/api/admin/discoveries/${session.id}/send`), {
      method: "POST",
      headers: ADMIN_HEADERS,
      body: "{}",
    });
    expect(sent.status).toBe(200);
    const sentBody = (await sent.json()) as {
      status: string;
      email: string | null;
      delivery: { mode: string; delivered: boolean };
    };
    expect(sentBody.status).toBe("sent");
    expect(sentBody.email).toBe(CONTACT.email);
    expect(sentBody.delivery.mode).toBe("outbox");
    expect(sentBody.delivery.delivered).toBe(false);

    const outbox = await fs.readdir(path.join(workdir, "outbox"));
    expect(outbox.some((file) => file.endsWith(".html"))).toBe(true);

    const preview = await fetch(
      url(`/api/admin/discoveries/${session.id}/email?token=${encodeURIComponent(ADMIN_TOKEN)}`),
    );
    expect(preview.status).toBe(200);
    expect(preview.headers.get("content-type")).toContain("text/html");

    const paid = await fetch(url(`/api/admin/discoveries/${session.id}/paid`), {
      method: "POST",
      headers: ADMIN_HEADERS,
      body: "{}",
    });
    expect(paid.status).toBe(200);
    expect(((await paid.json()) as { status: string }).status).toBe("paid");

    const onboarded = await fetch(url(`/api/admin/discoveries/${session.id}/onboard`), {
      method: "POST",
      headers: ADMIN_HEADERS,
      body: "{}",
    });
    expect(onboarded.status).toBe(200);
    const onboardedBody = (await onboarded.json()) as {
      status: string;
      runId: string | null;
      run: { status: string };
    };
    expect(onboardedBody.status).toBe("client");
    expect(onboardedBody.runId).toBeTruthy();
    expect(onboardedBody.run.status).toBe("suspended");
  });

  it("refuses call-done before a call is booked", async () => {
    const session = await startSession();
    const response = await fetch(url(`/api/admin/discoveries/${session.id}/call-done`), {
      method: "POST",
      headers: ADMIN_HEADERS,
      body: JSON.stringify({ notes: "Too early." }),
    });
    expect(response.status).toBe(409);
    expect(((await response.json()) as { error: string }).error).toBe("call_not_booked");
  });

  it("locks the session after the proposal is revealed", async () => {
    const session = await startSession();
    await answerAll(session.id);
    await sendContact(session.id);
    await requestBooking(session.id);
    await fetch(url(`/api/admin/discoveries/${session.id}/call-done`), {
      method: "POST",
      headers: ADMIN_HEADERS,
      body: JSON.stringify({ notes: "Done." }),
    });

    const edit = await fetch(url(`/api/discovery/${session.id}/edit`), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ stepId: "business", values: STEP_VALUES.business }),
    });
    expect(edit.status).toBe(409);
  });

  it("clears discoveries only with the reset confirmation", async () => {
    const session = await startSession();

    const unconfirmed = await fetch(url("/api/admin/reset"), {
      method: "POST",
      headers: ADMIN_HEADERS,
      body: JSON.stringify({}),
    });
    expect(unconfirmed.status).toBe(400);
    expect(((await unconfirmed.json()) as { error: string }).error).toBe("confirm_required");

    const cleared = await fetch(url("/api/admin/reset"), {
      method: "POST",
      headers: ADMIN_HEADERS,
      body: JSON.stringify({ confirm: "clear-all" }),
    });
    expect(cleared.status).toBe(200);
    const clearedBody = (await cleared.json()) as { cleared: number };
    expect(clearedBody.cleared).toBeGreaterThanOrEqual(1);

    const gone = await fetch(url(`/api/discovery/${session.id}`));
    expect(gone.status).toBe(404);
  });
});
