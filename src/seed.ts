import {
  STEPS,
  buildBrief,
  composeBottleneckDetail,
  composeCurrentProcess,
  composeWhatTheyDo,
} from "./discovery.js";
import type { DiscoveryContact } from "./discovery.js";
import type {
  DiscoverySession,
  DiscoveryStatus,
  DiscoveryStore,
  TranscriptEntry,
} from "./discovery-store.js";
import { matchPlays } from "./plays.js";
import type { ProposalConfig } from "./proposal.js";
import { buildProposal } from "./proposal.js";

interface Seed {
  answers: Record<string, string>;
  contact?: DiscoveryContact;
  status: Extract<
    DiscoveryStatus,
    "in_progress" | "booking" | "call_booked" | "proposal_ready" | "sent"
  >;
  ageMinutes: number;
  matchLimit: number;
  completedSteps?: string[];
  callNotes?: string;
  callStart?: string;
}

const WELCOME =
  "Hi — this is the intake for The Scale Reset. Four quick questions, then you pick a time for a call.";

function withDerived(answers: Record<string, string>): Record<string, string> {
  return {
    ...answers,
    whatTheyDo: answers.whatTheyDo ?? composeWhatTheyDo(answers),
    currentProcess: answers.currentProcess ?? composeCurrentProcess(answers),
    bottleneckDetail: answers.bottleneckDetail ?? composeBottleneckDetail(answers),
  };
}

const SEEDS: Seed[] = [
  {
    status: "proposal_ready",
    ageMinutes: 120,
    matchLimit: 2,
    contact: {
      name: "Ada Okafor",
      phone: "0803 555 0142",
      email: "ada@lagosbloom.com",
    },
    callNotes:
      "Confirmed the reply window is the real problem. Ada wants a first reply inside 15 minutes with her approval on anything custom. Quote follow-up is the second fix.",
    answers: withDerived({
      businessName: "Lagos Bloom Studio",
      industry: "Creative studio",
      location: "Lekki, Lagos",
      website: "@lagosbloom",
      offer: "plan and style small weddings and corporate events",
      customer: "busy professionals in Lagos",
      outcome: "one team to handle design, vendors, and setup",
      timeSinks: "Replying to new enquiries, Booking appointments and reminders",
      tools: "WhatsApp, Instagram DMs, Google Sheets / Excel",
      attempts: "Tried a tool",
      bottleneck: "Replying to new enquiries",
      frequency: "Several times a day",
      timeCost: "15–60 minutes",
      costOfFailure: "We lose bookings to studios that answer faster",
    }),
  },
  {
    status: "call_booked",
    ageMinutes: 45,
    matchLimit: 1,
    contact: {
      name: "Nneka Halden",
      phone: "0806 222 0177",
      email: "nneka@haldenbooks.co",
    },
    callStart: new Date(Date.now() + 2 * 86400000).toISOString(),
    answers: withDerived({
      businessName: "Halden Bookkeeping",
      industry: "Professional services",
      location: "Yaba, Lagos",
      website: "haldenbooks.co",
      offer: "reconcile books and prepare monthly reports for small agencies",
      customer: "small agencies and consultancies",
      outcome: "clean numbers without rebuilding the report by hand",
      timeSinks: "Weekly or monthly reports, Replying to new enquiries",
      tools: "Google Sheets / Excel, Email, WhatsApp",
      attempts: "Tried a tool",
      bottleneck: "Weekly or monthly reports",
      frequency: "Monthly",
      timeCost: "Half a day or more",
      costOfFailure: "The numbers disagree and the report goes out late",
    }),
  },
  {
    status: "sent",
    ageMinutes: 60 * 24 * 3,
    matchLimit: 1,
    contact: {
      name: "Tunde Kola",
      phone: "0805 444 0198",
      email: "tunde@kolalegal.ng",
    },
    callNotes:
      "Walked through the invoice backlog. The principal stays the only approver; reminders should go out without him writing them.",
    answers: withDerived({
      businessName: "Kola & Co Legal",
      industry: "Professional services",
      location: "Ikoyi, Lagos",
      website: "kolalegal.ng",
      offer: "handle commercial contracts and employment letters",
      customer: "owner-run businesses in Lagos",
      outcome: "a clear answer without chasing the principal",
      timeSinks: "Invoices and payment chasing, Weekly or monthly reports",
      tools: "Email, Google Sheets / Excel, Accounting software",
      attempts: "Not yet",
      bottleneck: "Invoices and payment chasing",
      frequency: "Monthly",
      timeCost: "15–60 minutes",
      costOfFailure: "Unpaid invoices sit for weeks",
    }),
  },
  {
    status: "in_progress",
    ageMinutes: 20,
    matchLimit: 1,
    completedSteps: ["business", "work"],
    answers: withDerived({
      businessName: "Mira Interiors",
      industry: "Creative studio",
      location: "Yaba, Lagos",
      website: "@mira.interiors",
      offer: "design residential renovations and small hospitality fit-outs",
      customer: "homeowners and small hoteliers",
      outcome: "a finished space without managing every vendor themselves",
    }),
  },
];

function clientSummary(answers: Record<string, string>, stepId: string): string {
  const step = STEPS.find((entry) => entry.id === stepId);
  if (!step) return "";
  return step.fields
    .map((field) => {
      const value = answers[field.id];
      return value ? `${field.label}: ${value}` : "";
    })
    .filter(Boolean)
    .join(" · ");
}

function transcriptFor(
  answers: Record<string, string>,
  asked: string[],
  contact: DiscoveryContact | undefined,
  createdAt: string,
): TranscriptEntry[] {
  const entries: TranscriptEntry[] = [{ role: "agent", text: WELCOME, at: createdAt }];

  for (const stepId of asked) {
    const step = STEPS.find((entry) => entry.id === stepId);
    if (!step) continue;
    entries.push({ role: "agent", text: step.title, at: createdAt, stepId });
    const summary = clientSummary(answers, stepId);
    if (summary) entries.push({ role: "client", text: summary, at: createdAt, stepId });
  }

  if (contact) {
    entries.push({
      role: "system",
      text: `Contact captured: ${[contact.name, contact.phone, contact.email]
        .filter(Boolean)
        .join(" · ")}.`,
      at: createdAt,
    });
  }

  return entries;
}

function applySeed(session: DiscoverySession, seed: Seed, config: ProposalConfig): DiscoverySession {
  const timestamp = new Date(Date.now() - seed.ageMinutes * 60 * 1000).toISOString();
  const asked =
    seed.status === "in_progress"
      ? (seed.completedSteps ?? [])
      : STEPS.map((step) => step.id);
  const pending = STEPS.map((step) => step.id).filter((id) => !asked.includes(id));

  session.createdAt = timestamp;
  session.updatedAt = timestamp;
  session.answers = seed.answers;
  session.contact = seed.contact;
  session.asked = asked;
  session.pending = pending;
  session.transcript = transcriptFor(seed.answers, asked, seed.contact, timestamp);
  session.brief = buildBrief(seed.answers, seed.contact);
  session.matches = matchPlays(seed.answers, seed.matchLimit);
  session.status = "in_progress";
  session.call = { status: "not_booked" };
  session.quality = { needsCall: false, thinSteps: [] };

  if (seed.status === "in_progress") {
    return session;
  }

  session.status = "booking";
  if (seed.status === "booking") {
    return session;
  }

  const callAt = new Date(Date.now() - Math.round(seed.ageMinutes / 2) * 60 * 1000).toISOString();
  session.call = {
    status: "booked",
    at: callAt,
    bookingUid: `seed_${session.id.slice(-6)}`,
    startTime: seed.callStart ?? new Date(Date.now() + 86400000).toISOString(),
    source: "whatsapp",
  };
  session.bookedAt = callAt;
  session.status = "call_booked";
  session.proposal = buildProposal(session, config, { source: "pre_call" });

  if (seed.status === "call_booked") {
    return session;
  }

  session.call.status = "completed";
  session.call.notes = seed.callNotes;
  session.callNotes = seed.callNotes;
  session.callCompletedAt = timestamp;
  session.status = "proposal_ready";
  session.proposal = buildProposal(session, config, { source: "post_call" });

  if (seed.status === "sent") {
    session.proposal.status = "sent";
    session.proposal.approvedBy = "Samuel";
    session.proposal.approvedAt = timestamp;
    session.proposal.sentAt = timestamp;
    session.approvedBy = "Samuel";
    session.approvedAt = timestamp;
    session.sentAt = timestamp;
    session.status = "sent";
  }

  return session;
}

export async function seedDemo(
  store: DiscoveryStore,
  config: ProposalConfig,
): Promise<string[]> {
  const existing = await store.list();
  if (existing.length > 0) return [];

  const created: string[] = [];
  for (const seed of SEEDS) {
    const session = await store.create();
    applySeed(session, seed, config);
    await store.save(session);
    created.push(session.id);
  }
  return created;
}
