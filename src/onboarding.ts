import { contactLabel } from "./discovery.js";
import type { DiscoverySession } from "./discovery-store.js";
import type { IntakeInput } from "./types.js";

/**
 * The bridge between the two phases. Discovery answers become the existing
 * six-step onboarding workflow's intake, so the paid phase never re-asks what the
 * quick intake already captured.
 */
export function buildIntakeFromDiscovery(session: DiscoverySession): IntakeInput {
  const answers = session.answers;
  const clientName = answers.businessName?.trim() || session.brief?.clientName || "New client";
  const process = [answers.currentProcess ?? session.brief?.currentProcess, answers.bottleneckDetail]
    .filter((value) => Boolean(value && String(value).trim()))
    .join("\n\n");
  const matches = session.matches ?? [];
  const contact = contactLabel(session.contact) || "not captured";
  const callNotes = (session.callNotes ?? "").trim();

  const context = [
    `Discovery session: ${session.id}.`,
    `Location: ${answers.location ?? "not captured"}.`,
    `Contact: ${contact}.`,
    `Current process: ${process || "not captured"}.`,
    `Bottleneck: ${answers.bottleneck ?? "not captured"}.`,
    `Frequency: ${answers.frequency ?? "not captured"}.`,
    `Time cost: ${answers.timeCost ?? "not captured"}.`,
    `Tools: ${answers.tools ?? "not captured"}.`,
    `Fix attempts: ${answers.attempts ?? "not captured"}.`,
    callNotes ? `Call notes: ${callNotes}` : "",
    matches.length > 0
      ? `Recommended plays: ${matches.map((match) => match.play.name).join(", ")}.`
      : "No play matched in discovery.",
    session.proposal
      ? `Indicative range: ${session.proposal.rangeLabel} (${session.proposal.timeline}).`
      : "",
  ]
    .filter((line) => line.length > 0)
    .join("\n");

  return {
    clientName,
    industry: answers.industry,
    website:
      answers.website && answers.website.trim().toLowerCase() !== "none"
        ? answers.website.trim()
        : undefined,
    context,
    docs: [],
    form: {
      businessDescription: answers.whatTheyDo ?? session.brief?.whatTheyDo ?? "",
      targetAudience: answers.customer ?? answers.whatTheyDo ?? "",
      brandPersonality: answers.costOfFailure
        ? `What it costs when it slips: ${answers.costOfFailure}. Confirm the voice on the onboarding call.`
        : "Warm, direct, operator-led. Confirm the voice on the onboarding call.",
      competitors: "Not discussed in the quick intake. Confirm on the onboarding call.",
      goals: [answers.outcome, answers.costOfFailure].filter(Boolean).join(" "),
      toneExamples: callNotes,
      offLimits: "Not captured in the quick intake. Confirm on the onboarding call.",
    },
    source: `discovery:${session.id}`,
  };
}
