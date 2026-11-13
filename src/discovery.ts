export type FieldKind = "text" | "longtext" | "chips" | "multi" | "guided";

export interface DiscoveryField {
  id: string;
  label: string;
  kind: FieldKind;
  options?: readonly string[];
  required: boolean;
  minLength?: number;
  minWords?: number;
  placeholder?: string;
  hint?: string;
  inputType?: "text" | "email" | "tel";
  autocomplete?: string;
}

export interface DiscoveryStep {
  id: string;
  kicker: string;
  title: string;
  hint?: string;
  why?: string;
  fields: readonly DiscoveryField[];
}

export interface DiscoveryContact {
  name: string;
  email?: string;
  phone?: string;
}

export const INDUSTRIES = [
  "Professional services",
  "Retail & e-commerce",
  "Hospitality",
  "Health & wellness",
  "Real estate",
  "Creative studio",
  "Education",
  "Other",
] as const;

export const TIME_SINKS = [
  "Replying to new enquiries",
  "Booking appointments and reminders",
  "Invoices and payment chasing",
  "Onboarding new clients",
  "Weekly or monthly reports",
  "Something else",
] as const;

export const TOOLS = [
  "WhatsApp",
  "Instagram DMs",
  "Email",
  "Google Sheets / Excel",
  "A CRM",
  "A booking app",
  "Accounting software",
  "Pen and paper",
] as const;

export const ATTEMPTS = ["Not yet", "Tried a tool", "Tried AI", "Hired someone"] as const;

export const FREQUENCIES = ["Several times a day", "Daily", "Weekly", "Monthly"] as const;

export const TIME_COSTS = [
  "Under 15 minutes",
  "15–60 minutes",
  "1–3 hours",
  "Half a day or more",
] as const;

export const TIME_SINK_PLAY: Record<string, string> = {
  "Replying to new enquiries": "lead-response",
  "Booking appointments and reminders": "booking-reminders",
  "Invoices and payment chasing": "invoice-chase",
  "Onboarding new clients": "client-onboarding",
  "Weekly or monthly reports": "reporting-digest",
};

export const STEPS: readonly DiscoveryStep[] = [
  {
    id: "business",
    kicker: "The business",
    title: "First, the basics.",
    hint: "So the plan reads like your business, not a template.",
    why: "The plan should use your real name, city, and space.",
    fields: [
      {
        id: "businessName",
        label: "Business name",
        kind: "text",
        required: true,
        minLength: 2,
        minWords: 1,
        placeholder: "Lagos Bloom Studio",
        autocomplete: "organization",
      },
      {
        id: "industry",
        label: "Industry",
        kind: "chips",
        options: INDUSTRIES,
        required: true,
      },
      {
        id: "location",
        label: "Where you're based",
        kind: "text",
        required: true,
        minLength: 2,
        minWords: 1,
        placeholder: "Lagos, Nigeria",
        autocomplete: "address-level2",
      },
      {
        id: "website",
        label: "Website or social (optional)",
        kind: "text",
        required: false,
        minLength: 2,
        minWords: 1,
        placeholder: "lagosbloom.com or @lagosbloom",
        inputType: "text",
      },
      {
        id: "businessDetail",
        label: "Tell me more (optional)",
        kind: "longtext",
        required: false,
        minLength: 0,
        minWords: 0,
        placeholder: "Anything about the business the plan should know.",
      },
    ],
  },
  {
    id: "work",
    kicker: "The work",
    title: "What do you do, and who is it for?",
    hint: "One sentence in three small parts.",
    why: "This is the lens we use when choosing the first fix.",
    fields: [
      {
        id: "offer",
        label: "We",
        kind: "guided",
        required: true,
        minLength: 3,
        minWords: 1,
        placeholder: "plan and style small weddings",
      },
      {
        id: "customer",
        label: "for",
        kind: "guided",
        required: true,
        minLength: 3,
        minWords: 1,
        placeholder: "busy professionals in Lagos",
      },
      {
        id: "outcome",
        label: "who want",
        kind: "guided",
        required: true,
        minLength: 3,
        minWords: 1,
        placeholder: "one team to handle every detail",
      },
      {
        id: "workDetail",
        label: "Tell me more (optional)",
        kind: "longtext",
        required: false,
        minLength: 0,
        minWords: 0,
        placeholder: "A sentence about the work, the customer, or the result.",
      },
    ],
  },
  {
    id: "week",
    kicker: "The week",
    title: "Where does the week actually go?",
    hint: "Tap everything that applies. This is where the time hides.",
    why: "We look for the task that repeats most and costs the most.",
    fields: [
      {
        id: "timeSinks",
        label: "What eats the most time?",
        kind: "multi",
        options: TIME_SINKS,
        required: true,
      },
      {
        id: "tools",
        label: "What do you use to run it today?",
        kind: "multi",
        options: TOOLS,
        required: true,
      },
      {
        id: "attempts",
        label: "Have you tried to fix any of it?",
        kind: "chips",
        options: ATTEMPTS,
        required: true,
      },
      {
        id: "weekDetail",
        label: "Tell me more (optional)",
        kind: "longtext",
        required: false,
        minLength: 0,
        minWords: 0,
        placeholder: "The task, where it comes from, and how often it happens.",
      },
    ],
  },
  {
    id: "bottleneck",
    kicker: "The bottleneck",
    title: "If one task disappeared forever, which one would you pick?",
    hint: "Pick the one you'd pay to never do again. The call walks through it.",
    why: "This becomes the first automation we scope.",
    fields: [
      {
        id: "bottleneck",
        label: "The one I'd pay to never do again",
        kind: "chips",
        options: TIME_SINKS,
        required: true,
      },
      {
        id: "frequency",
        label: "How often?",
        kind: "chips",
        options: FREQUENCIES,
        required: true,
      },
      {
        id: "timeCost",
        label: "Time each time",
        kind: "chips",
        options: TIME_COSTS,
        required: true,
      },
      {
        id: "costOfFailure",
        label: "What does it cost you when it slips? (optional)",
        kind: "text",
        required: false,
        minLength: 0,
        minWords: 0,
        placeholder: "Lost bookings, late cash, sleepless Sundays",
      },
      {
        id: "bottleneckNote",
        label: "Tell me more (optional)",
        kind: "longtext",
        required: false,
        minLength: 0,
        minWords: 0,
        placeholder: "What happens when this slips, and what it costs.",
      },
    ],
  },
];

export const STEP_IDS: readonly string[] = STEPS.map((step) => step.id);

export const ALL_FIELDS: readonly DiscoveryField[] = STEPS.flatMap((step) => step.fields);

const STEP_BY_ID = new Map(STEPS.map((step) => [step.id, step]));
const FIELD_BY_ID = new Map(ALL_FIELDS.map((field) => [field.id, field]));

export function stepById(id: string): DiscoveryStep | undefined {
  return STEP_BY_ID.get(id);
}

export function fieldById(id: string): DiscoveryField | undefined {
  return FIELD_BY_ID.get(id);
}

export function stepOfField(id: string): DiscoveryStep | undefined {
  return STEPS.find((step) => step.fields.some((field) => field.id === id));
}

export function listOf(value: string | undefined | null): string[] {
  return String(value ?? "")
    .split(/\s*,\s*/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function timeSinkPlay(answer: string | undefined): string | undefined {
  const value = String(answer ?? "").trim();
  return TIME_SINK_PLAY[value];
}

const BAD_WORDS = new Set([
  "a",
  "aa",
  "abc",
  "asdf",
  "asdfasdf",
  "b",
  "c",
  "d",
  "dad",
  "dfgh",
  "dunno",
  "foo",
  "gibberish",
  "hello",
  "idk",
  "lol",
  "n",
  "na",
  "nah",
  "nil",
  "no",
  "none",
  "nope",
  "null",
  "ok",
  "okay",
  "qwer",
  "qwerty",
  "sample",
  "sd",
  "sdf",
  "test",
  "testing",
  "todo",
  "xxx",
  "xyz",
  "yes",
  "zxcv",
]);

const BAD_EXACT = [/^n\/?a$/, /^\W+$/, /^(\d+)$/, /^(.)\1{2,}$/];

function compactOf(text: string): string {
  return text.replace(/[\s\p{P}\p{S}]/gu, "");
}

export function isSpecific(value: string, minWords = 1): boolean {
  const text = String(value ?? "").trim().toLowerCase();
  if (text.length < 2) return false;
  if (BAD_WORDS.has(text)) return false;
  if (BAD_EXACT.some((pattern) => pattern.test(text))) return false;

  const compact = compactOf(text);
  if (compact.length < 2) return false;
  if (/^(.)\1+$/.test(compact)) return false;

  const vowels = (text.match(/[aeiou]/g) ?? []).length;
  if (vowels === 0 && !/\d/.test(text)) return false;

  const words = text.split(/\s+/).filter(Boolean);
  const meaningful = words.filter((word) => word.length > 1);
  if (meaningful.length >= 2 && new Set(meaningful).size === 1) return false;

  const isHandle = /[@.]/.test(text) || /^\d+$/.test(compact);
  if (!isHandle && words.length < Math.max(1, minWords) && text.length < 6) return false;

  if (!isHandle && compact.length < 3) return false;
  return true;
}

export interface FieldCheck {
  ok: boolean;
  error?: string;
  soft?: boolean;
}

export function validateField(field: DiscoveryField, rawValue: string): FieldCheck {
  const value = String(rawValue ?? "").trim();

  if (!value) {
    return field.required ? { ok: false, error: "This one's needed." } : { ok: true };
  }

  if (!field.required && field.kind === "longtext") {
    return { ok: true };
  }

  if (field.kind === "chips") {
    if (!field.options?.includes(value)) {
      return { ok: false, error: "Pick one of the options." };
    }
    return { ok: true };
  }

  if (field.kind === "multi") {
    const chosen = listOf(value);
    if (chosen.length === 0) {
      return { ok: false, error: "Pick at least one." };
    }
    const unknown = chosen.filter((item) => !field.options?.includes(item));
    if (unknown.length > 0) {
      return { ok: false, error: "Pick from the options." };
    }
    return { ok: true };
  }

  const minLength = field.minLength ?? 1;
  if (value.length < minLength) {
    return {
      ok: false,
      error: `A little more detail, please (${value.length}/${minLength}).`,
    };
  }

  if (!isSpecific(value, field.minWords ?? 1)) {
    return {
      ok: false,
      error: "Add a few real words — or use \"explain on the call\" below.",
      soft: true,
    };
  }

  return { ok: true };
}

export function normalizeValues(
  input: Record<string, string | string[]>,
): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    values[key] = Array.isArray(value) ? value.join(", ") : String(value ?? "");
  }
  return values;
}

export interface StepCheck {
  ok: boolean;
  errors: Record<string, string>;
  values: Record<string, string>;
}

export function validateStep(
  stepId: string,
  input: Record<string, string | string[]>,
  options: { explainOnCall?: boolean } = {},
): StepCheck {
  const step = stepById(stepId);
  const values = normalizeValues(input);
  if (!step) {
    return { ok: false, errors: { _: "Unknown step." }, values };
  }

  const errors: Record<string, string> = {};
  if (!options.explainOnCall) {
    for (const field of step.fields) {
      const check = validateField(field, values[field.id] ?? "");
      if (!check.ok) errors[field.id] = check.error ?? "Check this one.";
    }
  }

  return { ok: Object.keys(errors).length === 0, errors, values };
}

export interface ContactCheck {
  ok: boolean;
  errors: Record<string, string>;
  contact: DiscoveryContact;
}

export function validateContact(input: Partial<DiscoveryContact>): ContactCheck {
  const name = String(input.name ?? "").trim();
  const email = String(input.email ?? "").trim();
  const phone = String(input.phone ?? "").trim();
  const errors: Record<string, string> = {};

  if (!isSpecific(name, 1)) {
    errors.name = "Add the name we should ask for.";
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = "Check the email address.";
  }
  if (phone && phone.replace(/[^0-9+]/g, "").length < 7) {
    errors.phone = "Check the phone number.";
  }
  if (!email && !phone) {
    errors.email = "Add an email or a WhatsApp number.";
  }

  return {
    ok: Object.keys(errors).length === 0,
    errors,
    contact: { name, email: email || undefined, phone: phone || undefined },
  };
}

export function contactLabel(contact?: DiscoveryContact): string {
  if (!contact) return "";
  return [contact.name, contact.phone, contact.email].filter(Boolean).join(" · ");
}

function stripLead(text: string, leads: readonly string[]): string {
  const trimmed = text.trim().replace(/[.。]+$/, "");
  const lower = trimmed.toLowerCase();
  for (const lead of leads) {
    if (lower.startsWith(lead)) return trimmed.slice(lead.length).trim();
  }
  return trimmed;
}

function midSentence(text: string): string {
  const trimmed = text.trim().replace(/[.。]+$/, "");
  if (!trimmed) return "";
  const first = trimmed.split(/\s+/)[0] ?? "";
  if (first.length > 1 && first === first.toUpperCase()) return trimmed;
  return trimmed.charAt(0).toLowerCase() + trimmed.slice(1);
}

function joinList(items: readonly string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

export function composeWhatTheyDo(answers: Record<string, string>): string {
  const offer = midSentence(
    stripLead(String(answers.offer ?? ""), ["we are ", "we're ", "we ", "i am ", "i'm ", "i "]),
  );
  const customer = midSentence(String(answers.customer ?? ""));
  const outcome = midSentence(String(answers.outcome ?? ""));

  if (offer && customer && outcome) {
    return `We ${offer} for ${customer} who want ${outcome}.`;
  }
  if (offer && customer) {
    return `We ${offer} for ${customer}.`;
  }
  if (offer && outcome) {
    return `We ${offer} for clients who want ${outcome}.`;
  }
  if (offer) {
    return `We ${offer}.`;
  }
  if (customer) {
    return `Serves ${customer}.`;
  }
  return "";
}

export function composeCurrentProcess(answers: Record<string, string>): string {
  const sinks = listOf(answers.timeSinks);
  const tools = listOf(answers.tools);
  const attempts = String(answers.attempts ?? "").trim();
  const lines: string[] = [];
  if (sinks.length > 0) lines.push(`Most of the week goes to ${joinList(sinks)}.`);
  if (tools.length > 0) lines.push(`Today it runs on ${joinList(tools)}.`);
  if (attempts) lines.push(`Fix attempts so far: ${attempts.toLowerCase()}.`);
  return lines.join(" ");
}

export function composeBottleneckDetail(answers: Record<string, string>): string {
  const frequency = String(answers.frequency ?? "").trim();
  const timeCost = String(answers.timeCost ?? "").trim();
  const failure = String(answers.costOfFailure ?? "").trim();

  const pieces: string[] = [];
  if (frequency) pieces.push(frequency.toLowerCase());
  if (timeCost) pieces.push(`${timeCost.toLowerCase()} each time`);

  const lines: string[] = [];
  if (pieces.length > 0) lines.push(`Happens ${joinList(pieces)}.`);
  if (failure) lines.push(`Cost when it slips: ${failure}.`);
  return lines.join(" ");
}

export interface DiscoveryBrief {
  clientName: string;
  website: string;
  location: string;
  industry: string;
  contact: string;
  whatTheyDo: string;
  currentProcess: string;
  bottleneck: string;
  bottleneckDetail: string;
  tools: string;
  goal: string;
  offLimits: string;
  summary: string;
}

function firstSentence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  const match = /^[\s\S]*?[.!?](?=\s|$)/.exec(trimmed);
  return (match?.[0] ?? trimmed).trim();
}

export function buildBrief(
  answers: Record<string, string>,
  contact?: DiscoveryContact,
): DiscoveryBrief {
  const clientName = String(answers.businessName ?? "").trim();
  const website = String(answers.website ?? "").trim();
  const location = String(answers.location ?? "").trim();
  const industry = String(answers.industry ?? "").trim();
  const whatTheyDo = String(answers.whatTheyDo ?? "").trim() || composeWhatTheyDo(answers);
  const currentProcess =
    String(answers.currentProcess ?? "").trim() || composeCurrentProcess(answers);
  const bottleneck = String(answers.bottleneck ?? "").trim();
  const bottleneckDetail =
    String(answers.bottleneckDetail ?? "").trim() || composeBottleneckDetail(answers);
  const tools = String(answers.tools ?? "").trim();
  const goal = String(answers.goal ?? answers.outcome ?? "").trim();
  const offLimits = String(answers.offLimits ?? "").trim();

  const intro = `${clientName || "This business"} is a ${
    industry ? industry.toLowerCase() : "service"
  } business${location ? ` in ${location}` : ""}.`;
  const offer = whatTheyDo ? ` ${firstSentence(whatTheyDo)}` : "";
  const frequency = String(answers.frequency ?? "").trim();
  const pain = bottleneck
    ? ` The task they would pay to never do again: ${bottleneck.toLowerCase()}${
        frequency ? ` (${frequency.toLowerCase()})` : ""
      }.`
    : "";

  return {
    clientName,
    website,
    location,
    industry,
    contact: contactLabel(contact),
    whatTheyDo,
    currentProcess,
    bottleneck,
    bottleneckDetail,
    tools,
    goal,
    offLimits,
    summary: `${intro}${offer}${pain}`.trim(),
  };
}

export function progressOf(askedSteps: number, pendingSteps: number): number {
  const total = askedSteps + pendingSteps;
  if (total === 0) return 100;
  return Math.round((askedSteps / total) * 100);
}
