import type { DiscoverySession } from "./discovery-store.js";
import {
  combinedTimeline,
  formatNaira,
  formatRange,
  getPlay,
  matchPlays,
} from "./plays.js";
import type { AutomationPlay, PlayMatch } from "./plays.js";

export interface ProposalConfig {
  callUrl: string;
  paymentUrl: string;
  whatsappUrl: string;
}

export type ProposalSource = "pre_call" | "post_call";

export interface ProposalPlay {
  id: string;
  name: string;
  strapline: string;
  icon: AutomationPlay["icon"];
  scope: string[];
  outcomes: string[];
  priceMin: number;
  priceMax: number;
  timeline: string;
  clientPart: string;
}

export interface Proposal {
  id: string;
  clientName: string;
  headline: string;
  summary: string;
  plays: ProposalPlay[];
  currency: "NGN";
  totalMin: number;
  totalMax: number;
  rangeLabel: string;
  timeline: string;
  assumptions: string[];
  nextSteps: string[];
  callUrl: string;
  paymentUrl: string;
  whatsappUrl: string;
  source: ProposalSource;
  status: "draft" | "approved" | "sent";
  createdAt: string;
  approvedBy?: string;
  approvedAt?: string;
  sentAt?: string;
  notes?: string;
}

function proposalId(): string {
  return `prop_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function toProposalPlay(match: PlayMatch): ProposalPlay {
  const play = match.play;
  return {
    id: play.id,
    name: play.name,
    strapline: play.strapline,
    icon: play.icon,
    scope: play.build,
    outcomes: play.outcomes,
    priceMin: play.priceMin,
    priceMax: play.priceMax,
    timeline: play.timeline,
    clientPart: play.clientPart,
  };
}

function chosenMatches(session: DiscoverySession): PlayMatch[] {
  if (session.matches && session.matches.length > 0) return session.matches.slice(0, 2);
  return matchPlays(session.answers, 2);
}

function sourceFor(session: DiscoverySession): ProposalSource {
  if (session.call?.status === "completed" || session.callCompletedAt) return "post_call";
  return "pre_call";
}

export function buildProposal(
  session: DiscoverySession,
  config: ProposalConfig,
  options: { source?: ProposalSource } = {},
): Proposal {
  const matches = chosenMatches(session);
  const plays = matches.map(toProposalPlay);
  const totalMin = plays.reduce((sum, play) => sum + play.priceMin, 0);
  const totalMax = plays.reduce((sum, play) => sum + play.priceMax, 0);
  const timeline = combinedTimeline(matches.map((match) => match.play));
  const clientName = session.brief?.clientName || session.answers.businessName || "New client";
  const source = options.source ?? sourceFor(session);
  const postCall = source === "post_call";

  const baseSummary =
    session.brief?.summary || `${clientName} is looking for a clear first automation win.`;
  const callNotes = (session.callNotes ?? "").trim();
  const summary = callNotes ? `${baseSummary}\n\nFrom the call: ${callNotes}` : baseSummary;

  const lowConfidence = matches.every((match) => match.confidence === "low");

  const assumptions = [
    "The range is indicative. The exact scope and price are confirmed on the call.",
    "Third-party tool subscriptions and ad spend are not included.",
    "The client provides access to the tools in scope before the build starts.",
    "Anything customer-facing keeps a human approval step.",
  ];
  if (lowConfidence) {
    assumptions.unshift(
      "We have not locked a single play yet. The call will confirm the first fix before the build.",
    );
  }
  if (postCall) {
    assumptions.unshift(
      "The scope and price were discussed on the call. If this differs from what you remember, tell us before paying.",
    );
  } else {
    assumptions.unshift(
      "This is an internal pre-call draft. It is not sent until after the call.",
      "The plan is based on four quick answers. The call fills in the detail.",
    );
  }

  const nextSteps = postCall
    ? [
        "Approve the scope and the exact price from the call.",
        "Pay the setup fee.",
        "We start the build within three working days.",
        "You get a working first version inside the timeline.",
      ]
    : [
        "Book a 20-minute call to confirm the scope and the exact price.",
        "Approve the plan and pay the setup fee.",
        "We start the build within three working days.",
        "You get a working first version inside the timeline.",
      ];

  return {
    id: proposalId(),
    clientName,
    headline: `${clientName}: a focused automation plan for ${plays
      .map((play) => play.name)
      .join(" + ")}`,
    summary,
    plays,
    currency: "NGN",
    totalMin,
    totalMax,
    rangeLabel: formatRange(totalMin, totalMax),
    timeline,
    assumptions,
    nextSteps,
    callUrl: config.callUrl,
    paymentUrl: config.paymentUrl,
    whatsappUrl: config.whatsappUrl,
    source,
    status: "draft",
    createdAt: new Date().toISOString(),
    notes: session.notes,
  };
}

export function renderProposalMarkdown(proposal: Proposal): string {
  const playSections = proposal.plays.map((play) =>
    [
      `### ${play.name}`,
      "",
      play.strapline,
      "",
      "**What we build**",
      "",
      ...play.scope.map((item) => `- ${item}`),
      "",
      "**What you get**",
      "",
      ...play.outcomes.map((item) => `- ${item}`),
      "",
      `**What we need from you:** ${play.clientPart}`,
      "",
    ].join("\n"),
  );

  const postCall = proposal.source === "post_call";
  const nextStepLines = postCall
    ? [
        `- Approve and pay: ${proposal.paymentUrl || "payment details are shared by email"}`,
        `- Questions: ${proposal.whatsappUrl || "reply to this email"}`,
      ]
    : [
        `- Book a call: ${proposal.callUrl || "the link will be shared by email"}`,
        `- Payment: ${proposal.paymentUrl || "details are shared after the call"}`,
      ];

  return [
    `# ${proposal.clientName} — Automation Plan`,
    "",
    "_Indicative proposal. Final scope and price are confirmed on the call._",
    "",
    "## What we heard",
    "",
    proposal.summary,
    "",
    "## Recommended scope",
    "",
    ...playSections,
    "## Timeline",
    "",
    proposal.timeline,
    "",
    "## Investment",
    "",
    `**${proposal.rangeLabel} (indicative)**`,
    "",
    "This is a range, not a final quote. Final scope and price are confirmed on the call.",
    "",
    "## Assumptions",
    "",
    ...proposal.assumptions.map((assumption) => `- ${assumption}`),
    "",
    "## Next step",
    "",
    ...nextStepLines,
    "",
  ].join("\n");
}

export interface ProposalGuardResult {
  ok: boolean;
  issues: string[];
}

/**
 * Deterministic guard. The model can write prose, but it can never invent a price
 * outside the approved play band or turn a range into a guaranteed quote.
 */
export function proposalGuard(proposal: Proposal): ProposalGuardResult {
  const issues: string[] = [];
  const markdown = renderProposalMarkdown(proposal).toLowerCase();

  if (!markdown.includes("indicative")) {
    issues.push("The proposal must label the range as indicative.");
  }

  if (!markdown.includes("confirmed on the call")) {
    issues.push("The proposal must say the final price is confirmed on the call.");
  }

  if (/guarantee|guaranteed|risk-free|100%\s+(?:results?|success|returns?)/i.test(markdown)) {
    issues.push("The proposal must not guarantee an outcome.");
  }

  for (const play of proposal.plays) {
    const source = getPlay(play.id);
    if (!source) {
      issues.push(`Unknown play: ${play.id}`);
      continue;
    }
    if (play.priceMin !== source.priceMin || play.priceMax !== source.priceMax) {
      issues.push(`Price for ${play.name} is outside the approved band.`);
    }
  }

  if (proposal.totalMin !== proposal.plays.reduce((sum, play) => sum + play.priceMin, 0)) {
    issues.push("The total minimum does not match the play bands.");
  }

  if (proposal.totalMax !== proposal.plays.reduce((sum, play) => sum + play.priceMax, 0)) {
    issues.push("The total maximum does not match the play bands.");
  }

  return { ok: issues.length === 0, issues };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderProposalEmail(proposal: Proposal): string {
  const playBlocks = proposal.plays
    .map(
      (play) => `
      <tr><td style="padding:0 0 22px;">
        <p style="margin:0 0 4px;font:600 16px/1.4 Arial,sans-serif;color:#14130f;">${escapeHtml(play.name)}</p>
        <p style="margin:0 0 10px;font:14px/1.55 Arial,sans-serif;color:#6b6459;">${escapeHtml(play.strapline)}</p>
        <ul style="margin:0;padding-left:18px;font:14px/1.6 Arial,sans-serif;color:#14130f;">
          ${play.scope.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
        </ul>
      </td></tr>`,
    )
    .join("");

  const assumptions = proposal.assumptions
    .map((item) => `<li style="margin:0 0 6px;">${escapeHtml(item)}</li>`)
    .join("");

  const postCall = proposal.source === "post_call";
  const primaryHref = postCall
    ? proposal.paymentUrl || proposal.whatsappUrl || "mailto:hello@thescalereset.com"
    : proposal.callUrl || "mailto:hello@thescalereset.com";
  const primaryLabel = postCall
    ? proposal.paymentUrl
      ? "Approve &amp; pay"
      : proposal.whatsappUrl
        ? "Confirm on WhatsApp"
        : "Reply to this email"
    : "Book a 20-minute call";

  const secondary = !postCall
    ? `<span style="display:inline-block;background:#eae3d6;color:#6b6459;font:600 14px/1 Arial,sans-serif;padding:14px 22px;border-radius:999px;margin:0 0 10px;">Payment details after the call</span>`
    : proposal.paymentUrl && proposal.whatsappUrl
      ? `<a href="${escapeHtml(
          proposal.whatsappUrl,
        )}" style="display:inline-block;background:#14130f;color:#f3eee4;text-decoration:none;font:600 14px/1 Arial,sans-serif;padding:14px 22px;border-radius:999px;margin:0 0 10px;">Ask a question</a>`
      : "";

  const footNote = postCall
    ? "The scope and price were agreed on the call. Nothing is charged until you approve."
    : "You can book the call before you pay. Nothing is final until the scope is confirmed.";

  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f3eee4;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3eee4;padding:28px 14px;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fbf8f1;border:1px solid #d8cfc0;border-radius:16px;overflow:hidden;">
<tr><td style="padding:28px 30px 8px;">
<p style="margin:0 0 6px;font:700 11px/1 Arial,sans-serif;letter-spacing:.16em;text-transform:uppercase;color:#1e5b4b;">The Scale Reset</p>
<h1 style="margin:0 0 10px;font:600 26px/1.2 Georgia,serif;color:#14130f;">${escapeHtml(proposal.clientName)} — your automation plan</h1>
<p style="margin:0 0 18px;font:15px/1.6 Arial,sans-serif;color:#6b6459;">${escapeHtml(proposal.summary)}</p>
</td></tr>
<tr><td style="padding:0 30px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#14130f;border-radius:14px;padding:22px 24px;color:#f3eee4;">
<tr><td>
<p style="margin:0 0 6px;font:700 10px/1 Arial,sans-serif;letter-spacing:.16em;text-transform:uppercase;color:#c7f25a;">Indicative investment</p>
<p style="margin:0 0 8px;font:600 30px/1.1 Georgia,serif;color:#f3eee4;">${escapeHtml(proposal.rangeLabel)}</p>
<p style="margin:0 0 14px;font:13px/1.5 Arial,sans-serif;color:#b8b1a5;">A range, not a final quote. Final scope and price are confirmed on the call.</p>
<p style="margin:0;font:600 13px/1.4 Arial,sans-serif;color:#f3eee4;">Timeline: ${escapeHtml(proposal.timeline)}</p>
</td></tr>
</table>
</td></tr>
<tr><td style="padding:26px 30px 0;">
<h2 style="margin:0 0 16px;font:700 11px/1 Arial,sans-serif;letter-spacing:.16em;text-transform:uppercase;color:#6b6459;">Recommended scope</h2>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${playBlocks}</table>
<h2 style="margin:10px 0 8px;font:700 11px/1 Arial,sans-serif;letter-spacing:.16em;text-transform:uppercase;color:#6b6459;">Assumptions</h2>
<ul style="margin:0 0 22px;padding-left:18px;font:13px/1.6 Arial,sans-serif;color:#6b6459;">${assumptions}</ul>
</td></tr>
<tr><td style="padding:0 30px 30px;">
<a href="${escapeHtml(primaryHref)}" style="display:inline-block;background:#1e5b4b;color:#f3eee4;text-decoration:none;font:600 14px/1 Arial,sans-serif;padding:14px 22px;border-radius:999px;margin:0 8px 10px 0;">${primaryLabel}</a>
${secondary}
<p style="margin:14px 0 0;font:12px/1.5 Arial,sans-serif;color:#9a9387;">${escapeHtml(footNote)}</p>
</td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

export function proposalRangeLabel(plays: readonly ProposalPlay[]): string {
  const min = plays.reduce((sum, play) => sum + play.priceMin, 0);
  const max = plays.reduce((sum, play) => sum + play.priceMax, 0);
  return formatRange(min, max);
}
