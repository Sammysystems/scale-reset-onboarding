import { TIME_SINK_PLAY } from "./discovery.js";

export interface AutomationPlay {
  id: string;
  name: string;
  strapline: string;
  icon: "bolt" | "calendar" | "invoice" | "handoff" | "chart";
  keywords: string[];
  triggers: string[];
  inputs: string[];
  build: string[];
  outcomes: string[];
  priceMin: number;
  priceMax: number;
  timeline: string;
  clientPart: string;
}

export const PLAYS: readonly AutomationPlay[] = [
  {
    id: "lead-response",
    name: "Lead Response & Follow-up",
    strapline:
      "Every enquiry gets a fast, consistent first reply and a follow-up that does not depend on memory.",
    icon: "bolt",
    keywords: [
      "enquir",
      "inquir",
      "lead",
      "whatsapp",
      "dm",
      "message",
      "reply",
      "respond",
      "follow up",
      "follow-up",
      "instagram",
      "form",
      "contact",
      "cold",
      "inbox",
      "missed",
      "slow",
    ],
    triggers: ["New enquiry from WhatsApp, Instagram, a website form, or a referral"],
    inputs: [
      "Current enquiry channels",
      "First-response script or real examples",
      "Who handles escalations",
    ],
    build: [
      "One shared record for every enquiry, whichever channel it came from",
      "First-response automation with a human approval step",
      "Follow-up sequence with clear stop rules",
      "Daily digest of enquiries still waiting",
    ],
    outcomes: [
      "Replies inside an agreed window",
      "No enquiry left without a follow-up",
      "One place to see what is waiting",
    ],
    priceMin: 350000,
    priceMax: 600000,
    timeline: "2–3 weeks",
    clientPart: "Share the channels, three to five real conversations, and who signs off on messages.",
  },
  {
    id: "booking-reminders",
    name: "Booking & Reminders",
    strapline: "Appointments book themselves and reminders cut the no-show tax.",
    icon: "calendar",
    keywords: [
      "book",
      "appointment",
      "schedule",
      "calendar",
      "no-show",
      "no show",
      "reschedul",
      "slot",
      "consult",
      "session",
      "reservation",
      "double",
    ],
    triggers: ["A client wants to book, reschedule, or cancel"],
    inputs: ["Availability rules", "Service list and durations", "Reminder timing and copy"],
    build: [
      "Booking link with real availability rules",
      "Automatic confirmation and reminders",
      "Reschedule and cancellation handling",
      "No-show follow-up",
    ],
    outcomes: [
      "Fewer no-shows",
      "No double-bookings",
      "The calendar is the single source of truth",
    ],
    priceMin: 300000,
    priceMax: 550000,
    timeline: "2–3 weeks",
    clientPart: "Confirm availability, service durations, and the reminder tone.",
  },
  {
    id: "invoice-chase",
    name: "Invoice & Payment Chase",
    strapline: "Invoices go out on time and reminders chase themselves, politely.",
    icon: "invoice",
    keywords: [
      "invoice",
      "payment",
      "receivable",
      "debt",
      "owe",
      "unpaid",
      "overdue",
      "chase",
      "remind",
      "bank transfer",
      "billing",
      "quote",
      "receipt",
    ],
    triggers: ["Invoice issued, due date approaching, or payment overdue"],
    inputs: ["Invoice template or accounting tool", "Payment terms", "Escalation rules"],
    build: [
      "Invoice schedule and send automation",
      "Polite reminder ladder with stop rules",
      "Payment confirmation logging",
      "Weekly receivables digest",
    ],
    outcomes: [
      "Faster cash collection",
      "Fewer manual reminders",
      "A clear view of what is overdue",
    ],
    priceMin: 300000,
    priceMax: 500000,
    timeline: "2 weeks",
    clientPart: "Share the invoice template, payment terms, and who approves exceptions.",
  },
  {
    id: "client-onboarding",
    name: "Client Onboarding & Handoff",
    strapline: "Every new client gets the same clean welcome, access, and first-week plan.",
    icon: "handoff",
    keywords: [
      "onboard",
      "welcome",
      "handoff",
      "hand over",
      "new client",
      "intake",
      "access",
      "documents",
      "kickoff",
      "kick-off",
      "contract",
      "brief",
      "welcome pack",
    ],
    triggers: ["A deal is closed and payment lands"],
    inputs: ["Welcome pack and contract", "Access checklist", "First-week milestones"],
    build: [
      "Automatic welcome sequence",
      "Access and document checklist",
      "Kickoff scheduling",
      "First-week progress digest",
    ],
    outcomes: [
      "No client waits for a welcome",
      "Nothing is missed at handoff",
      "The first week runs the same every time",
    ],
    priceMin: 350000,
    priceMax: 650000,
    timeline: "2–4 weeks",
    clientPart: "Share the welcome pack, access list, and first-week milestones.",
  },
  {
    id: "reporting-digest",
    name: "Reporting & Ops Digest",
    strapline: "The numbers arrive in one place, on schedule, without anyone compiling them by hand.",
    icon: "chart",
    keywords: [
      "report",
      "reporting",
      "number",
      "dashboard",
      "spreadsheet",
      "excel",
      "weekly",
      "monthly",
      "digest",
      "metric",
      "kpi",
      "summary",
      "compile",
      "copy-paste",
    ],
    triggers: ["The weekly or monthly reporting window"],
    inputs: ["Data sources and access", "The metrics that matter", "Who receives the digest"],
    build: [
      "Scheduled data pull from the tools already in use",
      "One-page digest with the metrics that matter",
      "Exception alerts when a number moves",
      "An archive of every digest",
    ],
    outcomes: [
      "No manual copy-paste",
      "The same numbers every week",
      "Problems surface earlier",
    ],
    priceMin: 400000,
    priceMax: 700000,
    timeline: "3–4 weeks",
    clientPart: "Grant read access to the data sources and confirm the metrics.",
  },
];

const PLAY_BY_ID = new Map(PLAYS.map((play) => [play.id, play]));

export function getPlay(id: string): AutomationPlay | undefined {
  return PLAY_BY_ID.get(id);
}

export interface MatchInput {
  whatTheyDo?: string;
  currentProcess?: string;
  bottleneck?: string;
  bottleneckDetail?: string;
  timeSink?: string;
  frequency?: string;
  timeCost?: string;
  costOfFailure?: string;
  tools?: string;
  goal?: string;
  offLimits?: string;
}

const WEIGHTED_FIELDS: ReadonlyArray<readonly [keyof MatchInput, number]> = [
  ["bottleneck", 4],
  ["bottleneckDetail", 3],
  ["currentProcess", 2],
  ["costOfFailure", 2],
  ["goal", 1.5],
  ["tools", 1],
  ["whatTheyDo", 0.5],
  ["frequency", 0.5],
];

export type PlayConfidence = "high" | "medium" | "low";

export interface PlayMatch {
  play: AutomationPlay;
  score: number;
  confidence: PlayConfidence;
  rationale: string;
  matched: string[];
}

function confidenceFor(score: number): PlayConfidence {
  if (score >= 8) return "high";
  if (score >= 3) return "medium";
  return "low";
}

/**
 * Deterministic play matcher. The model never chooses or prices the play; it only
 * reads the words the client used. That keeps the quote reproducible and auditable.
 */
export function matchPlays(input: MatchInput, limit = 2): PlayMatch[] {
  const scores = new Map<string, { score: number; matched: Set<string> }>();
  for (const play of PLAYS) scores.set(play.id, { score: 0, matched: new Set() });

  const directId =
    TIME_SINK_PLAY[input.timeSink ?? ""] ?? TIME_SINK_PLAY[input.bottleneck ?? ""];
  if (directId) {
    const entry = scores.get(directId);
    if (entry) {
      entry.score += 8;
      entry.matched.add(input.timeSink || input.bottleneck || "");
    }
  }

  for (const [field, weight] of WEIGHTED_FIELDS) {
    const text = (input[field] ?? "").toLowerCase();
    if (!text) continue;

    for (const play of PLAYS) {
      const entry = scores.get(play.id);
      if (!entry) continue;
      for (const keyword of play.keywords) {
        if (text.includes(keyword)) {
          entry.score += weight;
          entry.matched.add(keyword);
        }
      }
    }
  }

  const ranked = [...scores.entries()]
    .map(([id, entry]) => {
      const play = getPlay(id);
      return play ? { play, score: entry.score, matched: [...entry.matched] } : null;
    })
    .filter((row): row is { play: AutomationPlay; score: number; matched: string[] } => row !== null)
    .filter((row) => row.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);

  if (ranked.length === 0) {
    const fallback = PLAYS[0];
    if (!fallback) return [];
    return [
      {
        play: fallback,
        score: 0,
        confidence: "low",
        rationale: "No clear signal yet. The call will confirm the first fix.",
        matched: [],
      },
    ];
  }

  return ranked.map((row) => ({
    play: row.play,
    score: row.score,
    confidence: confidenceFor(row.score),
    rationale:
      row.matched.length > 0
        ? `Matched on: ${row.matched.slice(0, 4).join(", ")}.`
        : "Matched from the shape of the bottleneck.",
    matched: row.matched,
  }));
}

export function formatNaira(value: number): string {
  return `₦${Math.round(value).toLocaleString("en-US")}`;
}

export function formatRange(min: number, max: number): string {
  return `${formatNaira(min)} – ${formatNaira(max)}`;
}

export function combinedTimeline(plays: readonly AutomationPlay[]): string {
  if (plays.length === 0) return "2–3 weeks";
  if (plays.length === 1) return plays[0]?.timeline ?? "2–3 weeks";
  return "4–6 weeks";
}
