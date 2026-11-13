import { runQc } from "../qc.js";
import type {
  DraftBundle,
  FactcheckIssue,
  FactcheckResult,
  NormalizedIntake,
  ResearchResult,
} from "../types.js";
import type { ModelClient } from "./model.js";

const DRAFT_SYSTEM = [
  "You are a senior brand strategist writing client onboarding documents.",
  "Be specific and evidence-anchored. Never invent a number.",
  "Every figure must be followed by a (source: ...) note on the same line.",
  "Write clean Markdown. Do not use emojis or template placeholders.",
].join(" ");

function contextBlock(intake: NormalizedIntake, research: ResearchResult): string {
  const form = intake.form;
  return [
    `CLIENT: ${intake.clientName}`,
    `INDUSTRY: ${intake.industry}`,
    `BUSINESS: ${form.businessDescription ?? "(missing)"}`,
    `AUDIENCE: ${form.targetAudience ?? "(missing)"}`,
    `PERSONALITY: ${form.brandPersonality ?? "(missing)"}`,
    `COMPETITORS: ${form.competitors ?? "(missing)"}`,
    `GOALS: ${form.goals ?? "(missing)"}`,
    `TONE EXAMPLES: ${form.toneExamples ?? "(none)"}`,
    `OFF LIMITS: ${form.offLimits ?? "(none)"}`,
    "",
    "RESEARCH CONTEXT BRIEF:",
    research.contextBrief,
  ].join("\n");
}

async function draftOnce(
  model: ModelClient,
  intake: NormalizedIntake,
  research: ResearchResult,
  attempt: number,
  issues: FactcheckIssue[],
): Promise<DraftBundle> {
  const base = contextBlock(intake, research);
  const issueNote =
    issues.length > 0
      ? [
          "",
          "FIX THESE QUALITY ISSUES FROM THE PREVIOUS DRAFT:",
          ...issues.map((issue) => `- ${issue.code}: ${issue.message}`),
        ].join("\n")
      : "";

  const [avatar, tone, report] = await Promise.all([
    model.complete({
      system: DRAFT_SYSTEM,
      user: `TASK:draftAvatar ATTEMPT:${attempt}\n${base}${issueNote}`,
    }),
    model.complete({
      system: DRAFT_SYSTEM,
      user: `TASK:draftTone ATTEMPT:${attempt}\n${base}${issueNote}`,
    }),
    model.complete({
      system: DRAFT_SYSTEM,
      user: `TASK:draftReport ATTEMPT:${attempt}\n${base}${issueNote}`,
    }),
  ]);

  return {
    avatar: avatar.trim(),
    tone: tone.trim(),
    report: report.trim(),
  };
}

export interface DraftOutcome {
  drafts: DraftBundle;
  factcheck: FactcheckResult;
}

/**
 * Draft, run the deterministic quality gate, and re-draft with the issues fed back
 * until it passes or the attempt budget is spent. The loop lives inside one workflow
 * step so the process stays linear and inspectable.
 */
export async function draftUntilClean(
  model: ModelClient,
  intake: NormalizedIntake,
  research: ResearchResult,
  maxAttempts: number,
): Promise<DraftOutcome> {
  let attempt = 1;
  let drafts = await draftOnce(model, intake, research, attempt, []);
  let qc = runQc(drafts);

  while (qc.errors.length > 0 && attempt < maxAttempts) {
    attempt += 1;
    drafts = await draftOnce(model, intake, research, attempt, qc.errors);
    qc = runQc(drafts);
  }

  return {
    drafts,
    factcheck: {
      passed: qc.errors.length === 0,
      issues: [...qc.errors, ...qc.warnings],
      attempts: attempt,
    },
  };
}
