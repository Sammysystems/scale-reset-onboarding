import type { Memory } from "@voltagent/core";
import { createEventHooks, defineWorkflow } from "@studio/workflow";
import type { Notifier, StudioEventSink } from "@studio/workflow";
import { draftUntilClean } from "./agents/draft.js";
import { runResearch } from "./agents/research.js";
import type { ModelClient } from "./agents/model.js";
import type { ArtifactStore } from "./artifacts.js";
import { assessCompleteness } from "./completeness.js";
import type { Repository } from "./repo.js";
import { intakeInput, resultSchema, resumeSchema } from "./schemas.js";
import {
  renderApprovalNotice,
  renderDeliveredNotice,
  renderDocuments,
  renderThinIntakeNotice,
} from "./templates.js";
import type {
  Decision,
  IntakeForm,
  IntakeInput,
  NormalizedIntake,
  ResumeData,
  ScreenResult,
} from "./types.js";

export const WORKFLOW_ID = "client-onboarding-research";

export const STEP_ORDER = [
  "intake",
  "screen",
  "research",
  "draft",
  "approval",
  "finalize",
] as const;

const FORM_FIELDS = [
  "businessDescription",
  "targetAudience",
  "brandPersonality",
  "competitors",
  "goals",
  "toneExamples",
  "offLimits",
] as const;

export interface WorkflowOptions {
  model: ModelClient;
  memory: Memory;
  sink: StudioEventSink;
  notifier: Notifier;
  repository: Repository;
  artifacts: ArtifactStore;
  project: string;
  completenessThreshold: number;
  maxDraftAttempts: number;
  autoApprove: boolean;
}

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

function normalizeIntake(data: IntakeInput, requestId: string): NormalizedIntake {
  return {
    requestId,
    clientName: data.clientName.trim(),
    industry: clean(data.industry) ?? "unspecified",
    website: clean(data.website),
    context: data.context?.trim() ?? "",
    docs: data.docs ?? [],
    form: {
      businessDescription: clean(data.form?.businessDescription),
      targetAudience: clean(data.form?.targetAudience),
      brandPersonality: clean(data.form?.brandPersonality),
      competitors: clean(data.form?.competitors),
      goals: clean(data.form?.goals),
      toneExamples: clean(data.form?.toneExamples),
      offLimits: clean(data.form?.offLimits),
    },
    source: clean(data.source) ?? "webhook",
  };
}

function applySupplements(form: IntakeForm, supplements: Record<string, string>): IntakeForm {
  const next: IntakeForm = { ...form };
  const writable = next as Record<string, string | undefined>;

  for (const [key, value] of Object.entries(supplements)) {
    if ((FORM_FIELDS as readonly string[]).includes(key)) {
      writable[key] = value.trim();
    }
  }

  return next;
}

export function buildWorkflow(options: WorkflowOptions) {
  const hooks = createEventHooks({
    project: options.project,
    workflowId: WORKFLOW_ID,
    sink: options.sink,
    stepOrder: [...STEP_ORDER],
  });

  return defineWorkflow({
    id: WORKFLOW_ID,
    name: "Client Onboarding Research",
    purpose:
      "Turn a client intake form into approved, source-checked onboarding documents without the owner doing the research by hand.",
    tier: "agentic",
    input: intakeInput,
    result: resultSchema,
    resumeSchema,
    memory: options.memory,
    hooks,
  })
    .andThen({
      id: "intake",
      execute: async ({ data }) => {
        const requestId = `onb_${Date.now().toString(36)}_${Math.random()
          .toString(36)
          .slice(2, 6)}`;
        const intake = normalizeIntake(data, requestId);
        const report = assessCompleteness(intake.form);
        return { requestId, intake, completeness: report.score, gaps: report.gaps };
      },
    })
    .andThen({
      id: "screen",
      execute: async ({ data, suspend, resumeData }) => {
        const resume = resumeData as ResumeData | undefined;

        if (resume) {
          const supplements = resume.supplements ?? {};
          const form = applySupplements(data.intake.form, supplements);
          const report = assessCompleteness(form);
          const screen: ScreenResult = {
            action: resume.action === "supplement" ? "supplement" : "proceed",
            decidedBy: resume.decidedBy,
            completeness: report.score,
            missing: report.gaps,
            supplements,
          };
          return {
            requestId: data.requestId,
            intake: { ...data.intake, form },
            completeness: report.score,
            gaps: report.gaps,
            screen,
          };
        }

        if (data.completeness >= options.completenessThreshold) {
          const screen: ScreenResult = {
            action: "auto",
            decidedBy: "system",
            completeness: data.completeness,
            missing: data.gaps,
          };
          return { ...data, screen };
        }

        await options.notifier.send({
          to: "operator",
          subject: `Thin intake: ${data.intake.clientName}`,
          body: renderThinIntakeNotice(data.intake, data.gaps),
        });

        await suspend("Intake is thin - needs clarification before research", {
          reason: `Missing or thin: ${data.gaps.join(", ") || "unknown"}`,
          completeness: data.completeness,
          gaps: data.gaps,
          intake: data.intake,
        });

        throw new Error("unreachable after suspend");
      },
    })
    .andThen({
      id: "research",
      execute: async ({ data }) => {
        const research = await runResearch(options.model, data.intake);
        return { ...data, research };
      },
    })
    .andThen({
      id: "draft",
      execute: async ({ data }) => {
        const outcome = await draftUntilClean(
          options.model,
          data.intake,
          data.research,
          options.maxDraftAttempts,
        );
        return { ...data, drafts: outcome.drafts, factcheck: outcome.factcheck };
      },
    })
    .andThen({
      id: "approval",
      execute: async ({ data, suspend, resumeData }) => {
        const resume = resumeData as ResumeData | undefined;

        if (resume) {
          const decision: Decision = {
            status: resume.action === "reject" ? "rejected" : "approved",
            decidedBy: resume.decidedBy,
            notes: resume.notes,
          };
          return { ...data, decision };
        }

        if (options.autoApprove && data.factcheck.passed) {
          const decision: Decision = {
            status: "approved",
            decidedBy: "auto",
            notes: "auto-approved",
          };
          return { ...data, decision };
        }

        await options.notifier.send({
          to: "operator",
          subject: `Approve onboarding: ${data.intake.clientName}`,
          body: renderApprovalNotice(data.intake, data.factcheck),
        });

        await suspend("Onboarding documents ready for approval", {
          reason: `Ready for approval (quality gate ${
            data.factcheck.passed ? "passed" : "failed"
          })`,
          completeness: data.completeness,
          factcheck: data.factcheck,
          intake: data.intake,
        });

        throw new Error("unreachable after suspend");
      },
    })
    .andThen({
      id: "finalize",
      execute: async ({ data }) => {
        const decision = data.decision;
        const documents = renderDocuments(
          data.intake,
          data.research,
          data.drafts,
          data.factcheck,
          decision,
        );
        const stored = await options.artifacts.save(data.intake.clientName, documents);

        await options.repository.save({
          requestId: data.requestId,
          intake: data.intake,
          research: data.research,
          drafts: data.drafts,
          factcheck: data.factcheck,
          decision,
          documents: stored,
        });

        await options.notifier.send({
          to: "operator",
          subject: `Onboarding ${decision.status}: ${data.intake.clientName}`,
          body: renderDeliveredNotice(data.intake, stored),
        });

        return {
          requestId: data.requestId,
          client: data.intake.clientName,
          status: decision.status,
          decidedBy: decision.decidedBy,
          factcheckPassed: data.factcheck.passed,
          draftAttempts: data.factcheck.attempts,
          documents: stored.map((document) => ({ kind: document.kind, path: document.path })),
        };
      },
    });
}
