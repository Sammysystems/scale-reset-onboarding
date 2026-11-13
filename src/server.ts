import { promises as fs } from "node:fs";
import { createServer } from "node:http";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Engine } from "./engine.js";
import {
  STEPS,
  buildBrief,
  composeBottleneckDetail,
  composeCurrentProcess,
  composeWhatTheyDo,
  contactLabel,
  progressOf,
  stepById,
  validateContact,
  validateStep,
} from "./discovery.js";
import { createDiscoveryStore } from "./discovery-store.js";
import type { DiscoverySession, DiscoveryStore } from "./discovery-store.js";
import { sendEmail } from "./email.js";
import { buildIntakeFromDiscovery } from "./onboarding.js";
import { matchPlays } from "./plays.js";
import {
  buildProposal,
  renderProposalEmail,
  renderProposalMarkdown,
} from "./proposal.js";
import type { ProposalConfig } from "./proposal.js";
import {
  callDoneInput,
  discoveryContactInput,
  discoveryEditInput,
  discoveryRequestInput,
  discoveryStepInput,
  intakeInput,
  proposalDecisionInput,
  resumeSchema,
} from "./schemas.js";
const WORKFLOW_ID = "client-onboarding-research";

export interface ServerOptions {
  engine: Engine;
  port?: number;
  host?: string;
  runnerToken?: string;
  adminToken?: string;
  discovery?: DiscoveryStore;
  proposalConfig?: Partial<ProposalConfig>;
  outboxDir?: string;
  publicRoot?: string;
  whatsappNumber?: string;
  operatorEmail?: string;
}

export interface ServerHandle {
  server: Server;
  port: number;
  close: () => Promise<void>;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type,x-runner-token,x-admin-token",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".json": "application/json; charset=utf-8",
};

const REVEAL_PROPOSAL = new Set(["proposal_ready", "approved", "sent", "paid", "client"]);

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json", ...CORS_HEADERS });
  res.end(JSON.stringify(body));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function readRaw(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 1_000_000) throw new Error("payload_too_large");
    chunks.push(buffer);
  }

  return Buffer.concat(chunks);
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const raw = await readRaw(req);
  if (raw.length === 0) return {};
  return JSON.parse(raw.toString("utf8"));
}

function suspensionReason(suspension: {
  reason?: string;
  suspendData?: unknown;
} | null): string {
  const data = suspension?.suspendData;
  if (data && typeof data === "object" && "reason" in data) {
    const reason = (data as { reason?: unknown }).reason;
    if (typeof reason === "string" && reason.length > 0) return reason;
  }
  return suspension?.reason ?? "";
}

function serializeRun(result: Awaited<ReturnType<Engine["run"]>>): Record<string, unknown> {
  return {
    executionId: result.executionId,
    workflowId: result.workflowId,
    status: result.status,
    result: result.result ?? null,
    suspension: result.suspension
      ? {
          reason: suspensionReason(result.suspension),
          stepIndex: result.suspension.suspendedStepIndex,
          suspendData: result.suspension.suspendData,
        }
      : null,
  };
}

const DEFAULT_WHATSAPP_NUMBER = "2348035248296";

function normalizeWhatsAppNumber(value: string | undefined): string {
  const digits = (value ?? "").replace(/\D/g, "");
  return digits || DEFAULT_WHATSAPP_NUMBER;
}

function whatsAppMessage(session: DiscoverySession): string {
  const business =
    session.brief?.clientName || session.answers.businessName || "my business";
  const name = session.contact?.name ? ` This is ${session.contact.name}.` : "";
  const bottleneck = session.answers.bottleneck
    ? ` The main bottleneck is ${session.answers.bottleneck.toLowerCase()}.`
    : "";
  return `Hi Samuel, I just finished the Scale Reset booking for ${business}.${name}${bottleneck} I'd like to confirm a time. Session: ${session.id}.`;
}

function whatsAppUrl(session: DiscoverySession, whatsappNumber: string): string {
  return `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(whatsAppMessage(session))}`;
}

function publicSession(
  session: DiscoverySession,
  whatsappNumber: string,
): Record<string, unknown> {
  const currentStepId = session.pending[0];
  const currentStep = currentStepId ? stepById(currentStepId) : undefined;
  const hasAnswers = Object.keys(session.answers).length > 0;
  const brief = session.brief ?? (hasAnswers ? buildBrief(session.answers, session.contact) : null);
  const matches = session.matches ?? matchPlays(session.answers, 2);
  const total = session.asked.length + session.pending.length;
  const reveal = REVEAL_PROPOSAL.has(session.status);

  return {
    id: session.id,
    flowVersion: session.flowVersion ?? 2,
    status: session.status,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    answers: session.answers,
    asked: session.asked,
    pending: session.pending,
    currentStep: currentStep ?? null,
    stepBank: STEPS,
    brief,
    matches,
    proposal: reveal ? (session.proposal ?? null) : null,
    proposalReady: reveal,
    contact: session.contact ?? null,
    call: session.call ?? { status: "not_booked" },
    whatsappNumber,
    whatsappUrl: whatsAppUrl(session, whatsappNumber),
    needsCall: session.quality?.needsCall ?? false,
    thinSteps: session.quality?.thinSteps ?? [],
    transcript: session.transcript,
    progress: progressOf(session.asked.length, session.pending.length),
    answered: session.asked.length,
    total,
    notes: session.notes ?? null,
    approvedBy: session.approvedBy ?? null,
    approvedAt: session.approvedAt ?? null,
    sentAt: session.sentAt ?? null,
    bookedAt: session.bookedAt ?? null,
    callCompletedAt: session.callCompletedAt ?? null,
    paidAt: session.paidAt ?? null,
    runId: session.runId ?? null,
  };
}

function adminSession(
  session: DiscoverySession,
  whatsappNumber: string,
): Record<string, unknown> {
  return {
    ...publicSession(session, whatsappNumber),
    proposal: session.proposal ?? null,
    proposalSource: session.proposal?.source ?? null,
    callNotes: session.callNotes ?? null,
    quality: session.quality ?? { needsCall: false, thinSteps: [] },
    contactLabel: contactLabel(session.contact),
  };
}

function applyDerived(answers: Record<string, string>): void {
  answers.whatTheyDo = composeWhatTheyDo(answers);
  answers.currentProcess = composeCurrentProcess(answers);
  answers.bottleneckDetail = composeBottleneckDetail(answers);
}

export async function startServer(options: ServerOptions): Promise<ServerHandle> {
  const port = options.port ?? Number(process.env.PORT ?? 8790);
  const host = options.host ?? process.env.HOST ?? "127.0.0.1";
  const runnerToken = options.runnerToken ?? process.env.RUNNER_TOKEN ?? "";
  const adminToken = options.adminToken ?? process.env.ADMIN_TOKEN ?? "";
  const engine = options.engine;
  const discovery = options.discovery ?? createDiscoveryStore();
  const outboxDir =
    options.outboxDir ?? process.env.OUTBOX_DIR ?? path.resolve(process.cwd(), ".data", "outbox");
  const publicRoot =
    options.publicRoot ??
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "public");
  const whatsappNumber = normalizeWhatsAppNumber(
    options.whatsappNumber ?? process.env.WHATSAPP_NUMBER,
  );
  const operatorEmail = options.operatorEmail ?? process.env.OPERATOR_EMAIL ?? "";
  const bookingUrl = `https://wa.me/${whatsappNumber}`;
  const proposalConfig: ProposalConfig = {
    callUrl:
      options.proposalConfig?.callUrl ??
      process.env.CALL_URL ??
      bookingUrl,
    paymentUrl: options.proposalConfig?.paymentUrl ?? process.env.PAYMENT_URL ?? "",
    whatsappUrl: options.proposalConfig?.whatsappUrl ?? process.env.WHATSAPP_URL ?? "",
  };

  const authorized = (req: IncomingMessage): boolean => {
    if (!runnerToken) return true;
    return req.headers["x-runner-token"] === runnerToken;
  };

  const adminAuthorized = (req: IncomingMessage, url: URL): boolean => {
    if (!adminToken) return true;
    const header = req.headers["x-admin-token"];
    if (typeof header === "string" && header === adminToken) return true;
    return url.searchParams.get("token") === adminToken;
  };

  const cacheFor = (file: string): string => {
    const ext = path.extname(file).toLowerCase();
    if (ext === ".woff2" || ext === ".png" || ext === ".svg") {
      return "public, max-age=604800, stale-while-revalidate=86400";
    }
    if (ext === ".css" || ext === ".js") {
      return "public, max-age=300, stale-while-revalidate=86400";
    }
    return "no-store";
  };

  const serveFile = async (
    res: ServerResponse,
    file: string,
    status = 200,
  ): Promise<boolean> => {
    try {
      const data = await fs.readFile(file);
      const type = CONTENT_TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream";
      res.writeHead(status, {
        "Content-Type": type,
        "Cache-Control": cacheFor(file),
      });
      res.end(data);
      return true;
    } catch {
      return false;
    }
  };

  const notifyBooking = async (session: DiscoverySession): Promise<void> => {
    if (!operatorEmail) return;
    const when = session.call?.startTime
      ? new Date(session.call.startTime).toUTCString()
      : "time to be confirmed";
    const name = session.brief?.clientName || session.answers.businessName || "A new lead";
    const sink = session.answers.bottleneck ?? "not captured";
    await sendEmail(
      {
        to: operatorEmail,
        subject: `Booking request: ${name}`,
        text: [
          `${name} opened the WhatsApp booking.`,
          `Preferred time: ${when}`,
          `Contact: ${contactLabel(session.contact) || "not captured"}`,
          `Bottleneck: ${sink}`,
          `Frequency: ${session.answers.frequency ?? "not captured"}`,
          `Time cost: ${session.answers.timeCost ?? "not captured"}`,
          `Needs to explain on the call: ${session.quality?.needsCall ? "yes" : "no"}`,
          `Open the operator view: /admin?id=${session.id}`,
        ].join("\n"),
        html: `<p>${name} opened the WhatsApp booking.</p><p><strong>Preferred time:</strong> ${when}</p><p><strong>Contact:</strong> ${
          contactLabel(session.contact) || "not captured"
        }</p><p><strong>Bottleneck:</strong> ${sink}</p><p><strong>Needs to explain on the call:</strong> ${
          session.quality?.needsCall ? "yes" : "no"
        }</p>`,
      },
      { outboxDir },
    );
  };

  const handler = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    try {
      if (req.method === "OPTIONS") {
        res.writeHead(204, CORS_HEADERS);
        res.end();
        return;
      }

      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
      const pathname = url.pathname;

      if (req.method === "GET" && pathname === "/" && (url.searchParams.has("s") || url.searchParams.has("session"))) {
        res.writeHead(302, { Location: `/start${url.search}` });
        res.end();
        return;
      }

      if (req.method === "GET" && (pathname === "/" || pathname === "/landing.html")) {
        if (await serveFile(res, path.join(publicRoot, "landing.html"))) return;
      }

      if (req.method === "GET" && (pathname === "/start" || pathname === "/start/" || pathname === "/index.html")) {
        if (await serveFile(res, path.join(publicRoot, "start.html"))) return;
      }

      if (req.method === "GET" && (pathname === "/privacy" || pathname === "/privacy/")) {
        if (await serveFile(res, path.join(publicRoot, "privacy.html"))) return;
      }

      if (req.method === "GET" && (pathname === "/admin" || pathname === "/admin/")) {
        if (await serveFile(res, path.join(publicRoot, "admin.html"))) return;
      }

      if (req.method === "GET" && pathname === "/favicon.svg") {
        if (await serveFile(res, path.join(publicRoot, "favicon.svg"))) return;
      }

      if (req.method === "GET" && pathname === "/og-cover.png") {
        if (await serveFile(res, path.join(publicRoot, "og-cover.png"))) return;
      }

      if (req.method === "GET" && pathname.startsWith("/assets/")) {
        const file = pathname
          .slice("/assets/".length)
          .split("/")
          .map((segment) => segment.replace(/[^a-zA-Z0-9._-]/g, ""))
          .filter(Boolean)
          .join(path.sep);
        const target = path.resolve(publicRoot, file);
        const root = path.resolve(publicRoot);
        if (file && target.startsWith(root + path.sep) && (await serveFile(res, target))) return;
        sendJson(res, 404, { error: "asset_not_found" });
        return;
      }

      if (req.method === "GET" && pathname === "/health") {
        sendJson(res, 200, {
          ok: true,
          workflowId: WORKFLOW_ID,
          mode: engine.mode,
          model: engine.modelName,
          project: engine.project,
          studio: true,
          booking: "whatsapp",
          whatsapp: whatsappNumber ? "configured" : "unconfigured",
          uptimeSeconds: Math.round(process.uptime()),
        });
        return;
      }

      if (req.method === "POST" && pathname === "/api/discovery/start") {
        const session = await discovery.create();
        sendJson(res, 201, publicSession(session, whatsappNumber));
        return;
      }

      const publicMatch = /^\/api\/discovery\/([^/]+)$/.exec(pathname);
      if (req.method === "GET" && publicMatch?.[1]) {
        const session = await discovery.get(decodeURIComponent(publicMatch[1]));
        if (!session) {
          sendJson(res, 404, { error: "session_not_found" });
          return;
        }
        sendJson(res, 200, publicSession(session, whatsappNumber));
        return;
      }

      const stepMatch = /^\/api\/discovery\/([^/]+)\/step$/.exec(pathname);
      if (req.method === "POST" && stepMatch?.[1]) {
        let body: unknown;
        try {
          body = await readJson(req);
        } catch {
          sendJson(res, 400, { error: "invalid_json" });
          return;
        }

        const parsed = discoveryStepInput.safeParse(body);
        if (!parsed.success) {
          sendJson(res, 400, { error: "invalid_input", issues: parsed.error.issues });
          return;
        }

        const session = await discovery.get(decodeURIComponent(stepMatch[1]));
        if (!session) {
          sendJson(res, 404, { error: "session_not_found" });
          return;
        }
        if (session.status !== "in_progress" && session.status !== "booking") {
          sendJson(res, 409, { error: "session_locked", status: session.status });
          return;
        }

        const stepId = parsed.data.stepId;
        const step = stepById(stepId);
        if (!step) {
          sendJson(res, 400, { error: "unknown_step" });
          return;
        }
        if (session.pending[0] !== stepId) {
          sendJson(res, 409, { error: "out_of_order", expected: session.pending[0] ?? null });
          return;
        }

        const check = validateStep(stepId, parsed.data.values, {
          explainOnCall: parsed.data.explainOnCall,
        });
        if (!check.ok) {
          sendJson(res, 400, {
            error: "invalid_step",
            message: "A few taps or words are still missing.",
            errors: check.errors,
          });
          return;
        }

        for (const field of step.fields) {
          const value = (check.values[field.id] ?? "").trim();
          if (value) session.answers[field.id] = value;
          else delete session.answers[field.id];
        }
        applyDerived(session.answers);

        if (!session.asked.includes(stepId)) session.asked.push(stepId);
        session.pending = session.pending.filter((id) => id !== stepId);

        if (parsed.data.explainOnCall) {
          const quality = session.quality ?? { needsCall: false, thinSteps: [] };
          quality.needsCall = true;
          if (!quality.thinSteps.includes(stepId)) quality.thinSteps.push(stepId);
          session.quality = quality;
        }

        const now = new Date().toISOString();
        const summary = step.fields
          .map((field) => {
            const value = session.answers[field.id];
            return value ? `${field.label}: ${value}` : "";
          })
          .filter(Boolean)
          .join(" · ");
        session.transcript.push({
          role: "client",
          text: parsed.data.explainOnCall
            ? "I'd rather explain this one on the call."
            : summary,
          at: now,
          stepId,
        });

        const nextId = session.pending[0];
        const nextStep = nextId ? stepById(nextId) : undefined;
        if (nextStep) {
          session.transcript.push({
            role: "agent",
            text: nextStep.title,
            at: now,
            stepId: nextStep.id,
          });
        } else {
          session.status = "booking";
          session.transcript.push({
            role: "agent",
            text: "That's the four. Pick a time and we'll take it from there.",
            at: now,
          });
        }

        session.brief = buildBrief(session.answers, session.contact);
        session.matches = matchPlays(
          { ...session.answers, timeSink: session.answers.bottleneck },
          2,
        );
        session.updatedAt = now;
        await discovery.save(session);
        sendJson(res, 200, publicSession(session, whatsappNumber));
        return;
      }

      const editMatch = /^\/api\/discovery\/([^/]+)\/edit$/.exec(pathname);
      if (req.method === "POST" && editMatch?.[1]) {
        let body: unknown;
        try {
          body = await readJson(req);
        } catch {
          sendJson(res, 400, { error: "invalid_json" });
          return;
        }

        const parsed = discoveryEditInput.safeParse(body);
        if (!parsed.success) {
          sendJson(res, 400, { error: "invalid_input", issues: parsed.error.issues });
          return;
        }

        const session = await discovery.get(decodeURIComponent(editMatch[1]));
        if (!session) {
          sendJson(res, 404, { error: "session_not_found" });
          return;
        }
        if (session.status !== "in_progress" && session.status !== "booking") {
          sendJson(res, 409, { error: "session_locked", status: session.status });
          return;
        }

        const stepId = parsed.data.stepId;
        const step = stepById(stepId);
        if (!step || !session.asked.includes(stepId)) {
          sendJson(res, 400, { error: "step_not_asked" });
          return;
        }

        const check = validateStep(stepId, parsed.data.values);
        if (!check.ok) {
          sendJson(res, 400, {
            error: "invalid_step",
            message: "A few taps or words are still missing.",
            errors: check.errors,
          });
          return;
        }

        for (const field of step.fields) {
          const value = (check.values[field.id] ?? "").trim();
          if (value) session.answers[field.id] = value;
          else delete session.answers[field.id];
        }
        applyDerived(session.answers);

        const now = new Date().toISOString();
        session.transcript.push({
          role: "system",
          text: `Client updated "${step.kicker}".`,
          at: now,
          stepId,
        });
        session.brief = buildBrief(session.answers, session.contact);
        session.matches = matchPlays(
          { ...session.answers, timeSink: session.answers.bottleneck },
          2,
        );
        session.updatedAt = now;
        await discovery.save(session);
        sendJson(res, 200, publicSession(session, whatsappNumber));
        return;
      }

      const contactMatch = /^\/api\/discovery\/([^/]+)\/contact$/.exec(pathname);
      if (req.method === "POST" && contactMatch?.[1]) {
        let body: unknown;
        try {
          body = await readJson(req);
        } catch {
          sendJson(res, 400, { error: "invalid_json" });
          return;
        }

        const parsed = discoveryContactInput.safeParse(body);
        if (!parsed.success) {
          sendJson(res, 400, { error: "invalid_input", issues: parsed.error.issues });
          return;
        }

        const session = await discovery.get(decodeURIComponent(contactMatch[1]));
        if (!session) {
          sendJson(res, 404, { error: "session_not_found" });
          return;
        }
        if (session.call?.status === "booked" || REVEAL_PROPOSAL.has(session.status)) {
          sendJson(res, 409, { error: "session_locked", status: session.status });
          return;
        }

        const check = validateContact(parsed.data);
        if (!check.ok) {
          sendJson(res, 400, {
            error: "invalid_contact",
            message: "Check the contact details.",
            errors: check.errors,
          });
          return;
        }

        const now = new Date().toISOString();
        session.contact = check.contact;
        session.brief = buildBrief(session.answers, session.contact);
        session.updatedAt = now;
        session.transcript.push({
          role: "system",
          text: `Contact captured: ${contactLabel(session.contact)}.`,
          at: now,
        });
        await discovery.save(session);
        sendJson(res, 200, publicSession(session, whatsappNumber));
        return;
      }

      const requestMatch = /^\/api\/discovery\/([^/]+)\/request-call$/.exec(pathname);
      if (req.method === "POST" && requestMatch?.[1]) {
        let body: unknown;
        try {
          body = await readJson(req);
        } catch {
          sendJson(res, 400, { error: "invalid_json" });
          return;
        }
        const parsed = discoveryRequestInput.safeParse(body);
        if (!parsed.success) {
          sendJson(res, 400, { error: "invalid_input", issues: parsed.error.issues });
          return;
        }

        const session = await discovery.get(decodeURIComponent(requestMatch[1]));
        if (!session) {
          sendJson(res, 404, { error: "session_not_found" });
          return;
        }
        if (!session.contact) {
          sendJson(res, 400, { error: "contact_required" });
          return;
        }
        if (session.call?.status === "booked" || session.call?.status === "requested") {
          sendJson(res, 200, publicSession(session, whatsappNumber));
          return;
        }

        const now = new Date().toISOString();
        session.call = {
          status: "requested",
          at: now,
          source: "whatsapp",
          notes: parsed.data.preferred?.trim() || undefined,
        };
        session.bookedAt = session.bookedAt ?? now;
        session.status = "call_booked";
        if (!session.proposal) {
          session.proposal = buildProposal(session, proposalConfig, { source: "pre_call" });
        }
        session.updatedAt = now;
        session.transcript.push({
          role: "system",
          text: parsed.data.preferred
            ? `Booking opened on WhatsApp. Preferred time: ${parsed.data.preferred}.`
            : "Booking opened on WhatsApp.",
          at: now,
        });
        await discovery.save(session);
        await notifyBooking(session);
        sendJson(res, 200, publicSession(session, whatsappNumber));
        return;
      }

      const adminList = pathname === "/api/admin/discoveries";
      if (req.method === "GET" && adminList) {
        if (!adminAuthorized(req, url)) {
          sendJson(res, 401, { error: "unauthorized" });
          return;
        }
        const sessions = await discovery.list();
        sendJson(res, 200, {
          discoveries: sessions.map((session) => ({
            id: session.id,
            status: session.status,
            clientName:
              session.brief?.clientName ||
              session.answers.businessName ||
              "Unnamed discovery",
            industry: session.answers.industry ?? null,
            location: session.answers.location ?? null,
            matched: session.matches?.[0]?.play.name ?? null,
            range: session.proposal?.rangeLabel ?? null,
            proposalStatus: session.proposal?.status ?? null,
            proposalSource: session.proposal?.source ?? null,
            contactName: session.contact?.name ?? null,
            bottleneck: session.answers.bottleneck ?? null,
            needsCall: session.quality?.needsCall ?? false,
            callStatus: session.call?.status ?? "not_booked",
            callStartTime: session.call?.startTime ?? null,
            updatedAt: session.updatedAt,
            bookedAt: session.bookedAt ?? null,
            paidAt: session.paidAt ?? null,
            runId: session.runId ?? null,
          })),
        });
        return;
      }

      if (req.method === "POST" && pathname === "/api/admin/reset") {
        if (!adminAuthorized(req, url)) {
          sendJson(res, 401, { error: "unauthorized" });
          return;
        }
        let body: unknown;
        try {
          body = await readJson(req);
        } catch {
          sendJson(res, 400, { error: "invalid_json" });
          return;
        }
        const confirm = (body as { confirm?: unknown } | null)?.confirm;
        if (confirm !== "clear-all") {
          sendJson(res, 400, { error: "confirm_required" });
          return;
        }
        const sessions = await discovery.list();
        await discovery.clear();
        await fs.rm(outboxDir, { recursive: true, force: true });
        sendJson(res, 200, { ok: true, cleared: sessions.length, outboxCleared: true });
        return;
      }

      const adminDetailMatch = /^\/api\/admin\/discoveries\/([^/]+)$/.exec(pathname);
      if (req.method === "GET" && adminDetailMatch?.[1]) {
        if (!adminAuthorized(req, url)) {
          sendJson(res, 401, { error: "unauthorized" });
          return;
        }
        const session = await discovery.get(decodeURIComponent(adminDetailMatch[1]));
        if (!session) {
          sendJson(res, 404, { error: "session_not_found" });
          return;
        }
        sendJson(res, 200, adminSession(session, whatsappNumber));
        return;
      }

      const callDoneMatch = /^\/api\/admin\/discoveries\/([^/]+)\/call-done$/.exec(pathname);
      if (req.method === "POST" && callDoneMatch?.[1]) {
        if (!adminAuthorized(req, url)) {
          sendJson(res, 401, { error: "unauthorized" });
          return;
        }
        let body: unknown;
        try {
          body = await readJson(req);
        } catch {
          sendJson(res, 400, { error: "invalid_json" });
          return;
        }
        const parsed = callDoneInput.safeParse(body);
        if (!parsed.success) {
          sendJson(res, 400, { error: "invalid_input", issues: parsed.error.issues });
          return;
        }

        const session = await discovery.get(decodeURIComponent(callDoneMatch[1]));
        if (!session) {
          sendJson(res, 404, { error: "session_not_found" });
          return;
        }
        if (
          !["call_booked", "call_done", "booking"].includes(session.status) &&
          session.call?.status !== "requested"
        ) {
          sendJson(res, 409, { error: "call_not_booked", status: session.status });
          return;
        }

        const now = new Date().toISOString();
        const call = session.call ?? { status: "not_booked" as const };
        session.call = {
          ...call,
          status: "completed",
          at: call.at ?? now,
          notes: parsed.data.notes,
          source: call.source ?? "whatsapp",
        };
        session.callNotes = parsed.data.notes;
        session.callCompletedAt = now;
        session.status = "proposal_ready";
        session.matches = matchPlays(
          { ...session.answers, timeSink: session.answers.bottleneck },
          2,
        );
        session.proposal = buildProposal(session, proposalConfig, { source: "post_call" });
        session.updatedAt = now;
        session.transcript.push({
          role: "system",
          text: `Call done. Notes added by ${parsed.data.decidedBy}. Post-call proposal drafted.`,
          at: now,
        });
        await discovery.save(session);
        sendJson(res, 200, adminSession(session, whatsappNumber));
        return;
      }

      const approveMatch = /^\/api\/admin\/discoveries\/([^/]+)\/approve$/.exec(pathname);
      if (req.method === "POST" && approveMatch?.[1]) {
        if (!adminAuthorized(req, url)) {
          sendJson(res, 401, { error: "unauthorized" });
          return;
        }
        let body: unknown;
        try {
          body = await readJson(req);
        } catch {
          sendJson(res, 400, { error: "invalid_json" });
          return;
        }
        const parsed = proposalDecisionInput.safeParse(body);
        if (!parsed.success) {
          sendJson(res, 400, { error: "invalid_input", issues: parsed.error.issues });
          return;
        }
        const session = await discovery.get(decodeURIComponent(approveMatch[1]));
        if (!session) {
          sendJson(res, 404, { error: "session_not_found" });
          return;
        }
        if (!session.proposal) {
          sendJson(res, 409, { error: "proposal_missing" });
          return;
        }
        const now = new Date().toISOString();
        session.proposal.status = "approved";
        session.proposal.approvedBy = parsed.data.decidedBy;
        session.proposal.approvedAt = now;
        session.status = "approved";
        session.approvedBy = parsed.data.decidedBy;
        session.approvedAt = now;
        session.notes = parsed.data.notes;
        session.updatedAt = now;
        session.transcript.push({
          role: "system",
          text: `Proposal approved by ${parsed.data.decidedBy}.`,
          at: now,
        });
        await discovery.save(session);
        sendJson(res, 200, adminSession(session, whatsappNumber));
        return;
      }

      const sendMatch = /^\/api\/admin\/discoveries\/([^/]+)\/send$/.exec(pathname);
      if (req.method === "POST" && sendMatch?.[1]) {
        if (!adminAuthorized(req, url)) {
          sendJson(res, 401, { error: "unauthorized" });
          return;
        }
        const session = await discovery.get(decodeURIComponent(sendMatch[1]));
        if (!session) {
          sendJson(res, 404, { error: "session_not_found" });
          return;
        }
        if (!session.proposal) {
          sendJson(res, 409, { error: "proposal_missing" });
          return;
        }
        if (session.proposal.status === "draft") {
          sendJson(res, 409, { error: "proposal_not_approved" });
          return;
        }

        const email = session.contact?.email;
        const delivery = await sendEmail(
          {
            to: email ?? "unknown",
            subject: `${session.proposal.clientName} — your automation plan from The Scale Reset`,
            html: renderProposalEmail(session.proposal),
            text: renderProposalMarkdown(session.proposal),
          },
          { outboxDir },
        );

        const now = new Date().toISOString();
        session.proposal.status = "sent";
        session.proposal.sentAt = now;
        session.status = "sent";
        session.sentAt = now;
        session.updatedAt = now;
        session.transcript.push({
          role: "system",
          text: email
            ? `Proposal ${delivery.delivered ? "sent" : "queued"} to ${email}.`
            : "Proposal queued in the outbox; no email was captured.",
          at: now,
        });
        await discovery.save(session);
        sendJson(res, 200, { ...adminSession(session, whatsappNumber), delivery, email: email ?? null });
        return;
      }

      const paidMatch = /^\/api\/admin\/discoveries\/([^/]+)\/paid$/.exec(pathname);
      if (req.method === "POST" && paidMatch?.[1]) {
        if (!adminAuthorized(req, url)) {
          sendJson(res, 401, { error: "unauthorized" });
          return;
        }
        const session = await discovery.get(decodeURIComponent(paidMatch[1]));
        if (!session) {
          sendJson(res, 404, { error: "session_not_found" });
          return;
        }
        const now = new Date().toISOString();
        session.paidAt = now;
        session.status = "paid";
        session.updatedAt = now;
        session.transcript.push({ role: "system", text: "Payment marked as received.", at: now });
        await discovery.save(session);
        sendJson(res, 200, adminSession(session, whatsappNumber));
        return;
      }

      const onboardMatch = /^\/api\/admin\/discoveries\/([^/]+)\/onboard$/.exec(pathname);
      if (req.method === "POST" && onboardMatch?.[1]) {
        if (!adminAuthorized(req, url)) {
          sendJson(res, 401, { error: "unauthorized" });
          return;
        }
        const session = await discovery.get(decodeURIComponent(onboardMatch[1]));
        if (!session) {
          sendJson(res, 404, { error: "session_not_found" });
          return;
        }
        if (!session.proposal) {
          sendJson(res, 409, { error: "proposal_missing" });
          return;
        }

        const intake = buildIntakeFromDiscovery(session);
        const run = await engine.run(intake);
        const now = new Date().toISOString();
        session.runId = run.executionId;
        session.status = "client";
        session.updatedAt = now;
        session.transcript.push({
          role: "system",
          text: "Onboarding workflow started from the approved discovery.",
          at: now,
        });
        await discovery.save(session);
        sendJson(res, 200, { ...adminSession(session, whatsappNumber), run: serializeRun(run), intake });
        return;
      }

      const emailMatch = /^\/api\/admin\/discoveries\/([^/]+)\/email$/.exec(pathname);
      if (req.method === "GET" && emailMatch?.[1]) {
        if (!adminAuthorized(req, url)) {
          sendJson(res, 401, { error: "unauthorized" });
          return;
        }
        const session = await discovery.get(decodeURIComponent(emailMatch[1]));
        if (!session?.proposal) {
          sendJson(res, 404, { error: "proposal_not_found" });
          return;
        }
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(renderProposalEmail(session.proposal));
        return;
      }

      if (!authorized(req)) {
        sendJson(res, 401, { error: "unauthorized" });
        return;
      }

      if (req.method === "GET" && pathname === "/runs") {
        const status = url.searchParams.get("status") ?? undefined;
        const requestedLimit = Number(url.searchParams.get("limit") ?? 50);
        const limit = Number.isFinite(requestedLimit) ? Math.min(requestedLimit, 200) : 50;
        const runs = await engine.store.listRuns(status, limit);
        sendJson(res, 200, { runs });
        return;
      }

      if (req.method === "GET" && pathname === "/suspensions") {
        const suspensions = await engine.store.listSuspensions();
        sendJson(res, 200, { suspensions });
        return;
      }

      if (req.method === "POST" && pathname === "/webhooks/intake") {
        let body: unknown;
        try {
          body = await readJson(req);
        } catch {
          sendJson(res, 400, { error: "invalid_json" });
          return;
        }

        const parsed = intakeInput.safeParse(body);
        if (!parsed.success) {
          sendJson(res, 400, { error: "invalid_input", issues: parsed.error.issues });
          return;
        }

        const result = await engine.run(parsed.data);
        sendJson(res, result.status === "suspended" ? 202 : 200, serializeRun(result));
        return;
      }

      const runMatch = /^\/runs\/([^/]+)$/.exec(pathname);
      if (req.method === "GET" && runMatch?.[1]) {
        const detail = await engine.store.getRunDetail(decodeURIComponent(runMatch[1]));
        if (!detail) {
          sendJson(res, 404, { error: "run_not_found" });
          return;
        }
        sendJson(res, 200, detail);
        return;
      }

      const resumeMatch = /^\/runs\/([^/]+)\/resume$/.exec(pathname);
      if (req.method === "POST" && resumeMatch?.[1]) {
        let body: unknown;
        try {
          body = await readJson(req);
        } catch {
          sendJson(res, 400, { error: "invalid_json" });
          return;
        }

        const parsed = resumeSchema.safeParse(body);
        if (!parsed.success) {
          sendJson(res, 400, { error: "invalid_input", issues: parsed.error.issues });
          return;
        }

        try {
          const result = await engine.resume(
            decodeURIComponent(resumeMatch[1]),
            parsed.data,
          );
          if (!result) {
            sendJson(res, 404, { error: "run_not_suspended" });
            return;
          }
          sendJson(res, 200, serializeRun(result));
        } catch (error) {
          sendJson(res, 400, { error: "resume_failed", message: errorMessage(error) });
        }
        return;
      }

      sendJson(res, 404, { error: "not_found" });
    } catch (error) {
      sendJson(res, 500, { error: "internal_error", message: errorMessage(error) });
    }
  };

  const server = createServer((req, res) => {
    void handler(req, res);
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address();
  const actualPort = typeof address === "object" && address ? address.port : port;

  console.log(
    JSON.stringify({
      type: "server-started",
      host,
      port: actualPort,
      workflowId: WORKFLOW_ID,
      mode: engine.mode,
      model: engine.modelName,
      project: engine.project,
      studio: true,
    }),
  );

  return {
    server,
    port: actualPort,
    async close() {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    },
  };
}
