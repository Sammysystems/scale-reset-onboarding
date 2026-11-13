import type { NormalizedIntake, ResearchResult, SourceRef } from "../types.js";
import type { ModelClient } from "./model.js";

const COMMANDER_SYSTEM = [
  "You are a careful client-onboarding researcher.",
  "You never invent facts. When evidence is missing, you say so plainly.",
  "You write for a business owner, not a machine.",
].join(" ");

function specialistSystem(role: string): string {
  return [
    `You are the ${role} on a client onboarding team.`,
    "Work only from the provided dossier.",
    "Never invent facts, numbers, or sources. Mark unknowns as unknowns.",
  ].join(" ");
}

function buildDossier(intake: NormalizedIntake): string {
  const form = intake.form;
  const lines = [
    `CLIENT: ${intake.clientName}`,
    `INDUSTRY: ${intake.industry}`,
    intake.website ? `WEBSITE: ${intake.website}` : "WEBSITE: (none provided)",
    "",
    "INTAKE FORM",
    `- Business: ${form.businessDescription ?? "(missing)"}`,
    `- Target audience: ${form.targetAudience ?? "(missing)"}`,
    `- Brand personality: ${form.brandPersonality ?? "(missing)"}`,
    `- Competitors: ${form.competitors ?? "(missing)"}`,
    `- Goals: ${form.goals ?? "(missing)"}`,
    `- Tone examples: ${form.toneExamples ?? "(none)"}`,
    `- Off limits: ${form.offLimits ?? "(none)"}`,
    "",
    "EXTRA CONTEXT",
    intake.context || "(none)",
    "",
    "CLIENT DOCUMENTS",
    intake.docs.length > 0 ? intake.docs.join("\n") : "(none)",
  ];

  return lines.join("\n");
}

/**
 * The Commander runs a context brief, then three specialists in parallel, then the
 * caller synthesizes by keeping all four. This is the portable core of the
 * multi-agent-client-onboarding pattern.
 */
export async function runResearch(
  model: ModelClient,
  intake: NormalizedIntake,
): Promise<ResearchResult> {
  const dossier = buildDossier(intake);

  const contextBrief = await model.complete({
    system: COMMANDER_SYSTEM,
    user: `TASK:contextBrief\n${dossier}`,
  });

  const [workflowAudit, techStack, strategy] = await Promise.all([
    model.complete({
      system: specialistSystem("workflow auditor"),
      user: `TASK:workflowAudit\n${dossier}`,
    }),
    model.complete({
      system: specialistSystem("tech stack mapper"),
      user: `TASK:techStack\n${dossier}`,
    }),
    model.complete({
      system: specialistSystem("strategy drafter"),
      user: `TASK:strategy\n${dossier}`,
    }),
  ]);

  const sources: SourceRef[] = [];
  if (intake.docs.length > 0) {
    sources.push(...intake.docs.map((doc) => ({ label: "client document", detail: doc })));
  }
  if (intake.website) {
    sources.push({ label: "client website", detail: intake.website });
  }
  if (intake.context) {
    sources.push({ label: "client context", detail: "provided in the intake form" });
  }

  return {
    contextBrief: contextBrief.trim(),
    findings: {
      workflowAudit: workflowAudit.trim(),
      techStack: techStack.trim(),
      strategy: strategy.trim(),
    },
    sources,
  };
}
