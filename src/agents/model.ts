export interface ModelRequest {
  system: string;
  user: string;
  json?: boolean;
}

export interface ModelClient {
  readonly name: string;
  complete(request: ModelRequest): Promise<string>;
}

/**
 * Deterministic, offline model. Good enough to prove the whole pipeline, and it
 * deliberately produces one unsupported claim on the first drafting attempt so the
 * quality gate has something real to catch.
 */
export class MockModelClient implements ModelClient {
  readonly name = "mock";

  async complete(request: ModelRequest): Promise<string> {
    const firstLine = request.user.split("\n")[0] ?? "";
    const task = firstLine.trim().split(/\s+/)[0] ?? "";
    const attempt = Number(/ATTEMPT:(\d+)/.exec(request.user)?.[1] ?? "1");

    switch (task) {
      case "TASK:contextBrief":
        return CONTEXT_BRIEF;
      case "TASK:workflowAudit":
        return WORKFLOW_AUDIT;
      case "TASK:techStack":
        return TECH_STACK;
      case "TASK:strategy":
        return STRATEGY;
      case "TASK:draftAvatar":
        return attempt <= 1 ? AVATAR_DRAFT_WITH_ISSUES : AVATAR_CLEAN;
      case "TASK:draftTone":
        return TONE_CLEAN;
      case "TASK:draftReport":
        return REPORT_CLEAN;
      default:
        return `No mock response registered for task: ${firstLine}`;
    }
  }
}

export interface OpenAICompatibleOptions {
  baseUrl: string;
  apiKey?: string;
  model: string;
  temperature?: number;
  fetchImpl?: typeof fetch;
}

export function createOpenAICompatibleClient(options: OpenAICompatibleOptions): ModelClient {
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    name: `openai-compatible:${options.model}`,
    async complete(request) {
      const response = await fetchImpl(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(options.apiKey ? { Authorization: `Bearer ${options.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: options.model,
          temperature: options.temperature ?? 0.4,
          messages: [
            { role: "system", content: request.system },
            { role: "user", content: request.user },
          ],
          ...(request.json ? { response_format: { type: "json_object" } } : {}),
        }),
      });

      if (!response.ok) {
        throw new Error(`Model request failed ${response.status}: ${await response.text()}`);
      }

      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = payload.choices?.[0]?.message?.content;

      if (!content) throw new Error("Model response did not include content");

      return content;
    },
  };
}

export function createModelClientFromEnv(env: NodeJS.ProcessEnv = process.env): ModelClient {
  const provider = (env.MODEL_PROVIDER ?? "mock").toLowerCase();

  if (provider === "mock") return new MockModelClient();

  if (
    provider === "openai-compatible" ||
    provider === "gateway" ||
    provider === "insforge" ||
    provider === "omniroute"
  ) {
    const baseUrl = env.MODEL_BASE_URL;
    const model = env.MODEL_NAME;

    if (!baseUrl || !model) {
      throw new Error(
        `MODEL_BASE_URL and MODEL_NAME are required when MODEL_PROVIDER=${provider}`,
      );
    }

    return createOpenAICompatibleClient({
      baseUrl,
      apiKey: env.MODEL_API_KEY,
      model,
    });
  }

  throw new Error(`Unknown MODEL_PROVIDER: ${provider}`);
}

const CONTEXT_BRIEF = [
  "The client is a small service business whose enquiries arrive through several channels.",
  "The immediate goal is a faster, more consistent first response without adding headcount.",
  "Evidence is limited to the intake form, so this brief flags assumptions rather than inventing facts.",
].join(" ");

const WORKFLOW_AUDIT = [
  "Enquiries arrive through a web form, direct messages, and referrals.",
  "The slowest handoff is the first response, which currently depends on whoever notices the message.",
  "Qualifying questions are repeated by hand.",
  "No shared record of each enquiry exists, so follow-up depends on memory.",
].join(" ");

const TECH_STACK = [
  "There is no single system of record.",
  "Data is spread across a shared inbox, a spreadsheet, and a chat app.",
  "There is no automation layer between the channels and the team, so every step is manual.",
].join(" ");

const STRATEGY = [
  "Start with the first-response handoff because it is the highest-friction point.",
  "Add a shared enquiry record next so follow-up stops depending on memory.",
  "Put a human approval step in front of anything customer-facing, then widen coverage once the first two moves hold.",
].join(" ");

const AVATAR_DRAFT_WITH_ISSUES = [
  "## Who they serve",
  "",
  "The client serves small business owners who need a dependable stream of qualified enquiries.",
  "",
  "## Pain points",
  "",
  "- They lose 37% of inbound leads to slow replies.",
  "[[UNVERIFIED: the 37% figure has no source]]",
  "- Follow-up depends on the owner remembering to do it.",
].join("\n");

const AVATAR_CLEAN = [
  "## Who they serve",
  "",
  "The client serves small business owners who need a dependable stream of qualified enquiries without hiring a full sales team.",
  "",
  "## Positioning",
  "",
  "A practical, fast-moving partner that turns scattered enquiries into booked conversations.",
  "",
  "## Pain points",
  "",
  "- Enquiries arrive through several channels and get answered late.",
  "- Follow-up depends on the owner remembering to do it.",
  "- The team repeats the same qualification questions by hand.",
  "",
  "## Buying triggers",
  "",
  "- A spike in enquiries they cannot answer in time.",
  "- A new hire who needs a clear process on day one.",
  "",
  "## Objections to pre-empt",
  "",
  "- We already have a CRM. The engine works with the tools they have.",
  "- AI will sound robotic. Voice rules and human sign-off keep it in their voice.",
].join("\n");

const TONE_CLEAN = [
  "## Voice in one line",
  "",
  "Direct, warm, and specific, like a trusted operator explaining what happens next.",
  "",
  "## We sound like",
  "",
  "- Clear about the next step.",
  "- Comfortable saying what we do not do.",
  "",
  "## We do not sound like",
  "",
  "- A press release.",
  "- A sales script that hides the price.",
  "",
  "## Vocabulary",
  "",
  "- Prefer: enquiry, next step, booked, follow-up.",
  "- Avoid: funnel, omni-channel, paradigm.",
  "",
  "## Sample lines",
  "",
  '- "Here is what happens next, and who does it."',
  '- "If this is not a fit, we will tell you on the first call."',
].join("\n");

const REPORT_CLEAN = [
  "## Snapshot",
  "",
  "- Primary goal: a faster, consistent first response without adding headcount.",
  "- Current friction: enquiries arrive through several channels and are handled by hand.",
  "",
  "## What good looks like after onboarding",
  "",
  "- Every enquiry gets a first response inside the agreed window.",
  "- Follow-up runs from a defined sequence, not memory.",
  "- Anything customer-facing passes a human approval step.",
  "",
  "## First three moves",
  "",
  "1. Map the enquiry path from first contact to booked call.",
  "2. Fix the slowest handoff first.",
  "3. Put the approval step in front of outbound messages before widening coverage.",
].join("\n");
