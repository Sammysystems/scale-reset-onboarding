import { describe, expect, it } from "vitest";
import { buildBrief } from "../src/discovery.js";
import { createSession } from "../src/discovery-store.js";
import type { DiscoverySession } from "../src/discovery-store.js";
import { formatRange, matchPlays } from "../src/plays.js";
import {
  buildProposal,
  proposalGuard,
  proposalRangeLabel,
  renderProposalEmail,
  renderProposalMarkdown,
} from "../src/proposal.js";

const config = {
  callUrl: "https://cal.example/book",
  paymentUrl: "https://pay.example/setup",
  whatsappUrl: "",
};

const answers = {
  businessName: "Lagos Bloom Studio",
  industry: "Creative studio",
  location: "Lekki, Lagos",
  website: "@lagosbloom",
  offer: "plan and style small weddings",
  customer: "busy professionals in Lagos",
  outcome: "one team to handle every detail",
  timeSinks: "Replying to new enquiries",
  tools: "WhatsApp, Instagram DMs",
  attempts: "Tried a tool",
  bottleneck: "Replying to new enquiries",
  frequency: "Several times a day",
  timeCost: "15–60 minutes",
  costOfFailure: "We lose bookings to faster studios",
  whatTheyDo:
    "We plan and style small weddings for busy professionals in Lagos who want one team to handle every detail.",
  currentProcess: "Most of the week goes to replying to new enquiries.",
  bottleneckDetail: "Happens several times a day. 15–60 minutes each time.",
};

function sessionWith(
  extra: { callNotes?: string; completed?: boolean } = {},
): DiscoverySession {
  const session = createSession();
  session.answers = answers;
  session.asked = ["business", "work", "week", "bottleneck"];
  session.pending = [];
  session.status = extra.completed ? "proposal_ready" : "call_booked";
  session.contact = { name: "Ada Okafor", email: "ada@lagosbloom.com" };
  session.brief = buildBrief(answers, session.contact);
  session.matches = matchPlays({ ...answers, timeSink: answers.bottleneck }, 2);
  session.callNotes = extra.callNotes;
  session.call = extra.completed
    ? { status: "completed", at: new Date().toISOString(), source: "cal" }
    : { status: "booked", at: new Date().toISOString(), source: "cal" };
  if (extra.completed) session.callCompletedAt = new Date().toISOString();
  return session;
}

describe("proposal builder", () => {
  const preCall = buildProposal(sessionWith(), config);

  it("derives the range from the matched play bands", () => {
    expect(preCall.plays.length).toBeGreaterThanOrEqual(1);
    const min = preCall.plays.reduce((sum, play) => sum + play.priceMin, 0);
    const max = preCall.plays.reduce((sum, play) => sum + play.priceMax, 0);
    expect(preCall.totalMin).toBe(min);
    expect(preCall.totalMax).toBe(max);
    expect(preCall.rangeLabel).toBe(formatRange(min, max));
    expect(proposalRangeLabel(preCall.plays)).toBe(preCall.rangeLabel);
    expect(preCall.currency).toBe("NGN");
  });

  it("starts as a hidden pre-call draft with the configured links", () => {
    expect(preCall.source).toBe("pre_call");
    expect(preCall.status).toBe("draft");
    expect(preCall.callUrl).toBe(config.callUrl);
    expect(preCall.paymentUrl).toBe(config.paymentUrl);
    expect(preCall.assumptions.join(" ")).toContain("internal pre-call draft");
    expect(preCall.nextSteps[0]).toContain("Book a 20-minute call");
  });

  it("sends the client to the call, not the checkout, before the call", () => {
    const markdown = renderProposalMarkdown(preCall).toLowerCase();
    expect(markdown).toContain("indicative");
    expect(markdown).toContain("confirmed on the call");
    expect(markdown).toContain("book a call");

    const email = renderProposalEmail(preCall);
    expect(email).toContain(preCall.rangeLabel);
    expect(email).toContain("Book a 20-minute call");
    expect(email).not.toContain("Approve &amp; pay");
  });

  it("passes the deterministic guard", () => {
    const result = proposalGuard(preCall);
    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it("promotes to a post-call proposal once the call is complete", () => {
    const postCall = buildProposal(
      sessionWith({ completed: true, callNotes: "Confirmed the 15-minute reply window." }),
      config,
    );
    expect(postCall.source).toBe("post_call");
    expect(postCall.summary).toContain("From the call: Confirmed the 15-minute reply window.");
    expect(postCall.assumptions.join(" ")).toContain("discussed on the call");
    expect(postCall.nextSteps[0]).toContain("Approve the scope");

    const email = renderProposalEmail(postCall);
    expect(email).toContain("Approve &amp; pay");
    expect(email).not.toContain("Book a 20-minute call");
    expect(proposalGuard(postCall).ok).toBe(true);
  });

  it("honours an explicit source override", () => {
    const forced = buildProposal(sessionWith(), config, { source: "post_call" });
    expect(forced.source).toBe("post_call");
  });

  it("flags a price outside the approved play band", () => {
    const first = preCall.plays[0]!;
    const tampered = {
      ...preCall,
      plays: [{ ...first, priceMin: first.priceMin + 1 }, ...preCall.plays.slice(1)],
    };
    tampered.totalMin = preCall.totalMin + 1;
    const result = proposalGuard(tampered);
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.includes("outside the approved band"))).toBe(true);
  });

  it("flags a guaranteed outcome", () => {
    const guaranteed = { ...preCall, summary: "We guarantee results in 30 days." };
    const result = proposalGuard(guaranteed);
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.includes("guarantee"))).toBe(true);
  });
});
