import { z } from "zod";

export const intakeInput = z.object({
  clientName: z.string().min(1),
  industry: z.string().optional(),
  website: z.string().optional(),
  context: z.string().optional(),
  docs: z.array(z.string()).optional(),
  form: z
    .object({
      businessDescription: z.string().optional(),
      targetAudience: z.string().optional(),
      brandPersonality: z.string().optional(),
      competitors: z.string().optional(),
      goals: z.string().optional(),
      toneExamples: z.string().optional(),
      offLimits: z.string().optional(),
    })
    .optional(),
  source: z.string().optional(),
});

export const resumeSchema = z.object({
  action: z.enum(["supplement", "proceed", "approve", "reject"]),
  decidedBy: z.string().min(1).default("operator"),
  supplements: z.record(z.string(), z.string()).optional(),
  notes: z.string().optional(),
});

const stepValues = z.record(z.string(), z.union([z.string(), z.array(z.string())]));

export const discoveryStepInput = z.object({
  stepId: z.string().min(1),
  values: stepValues.default({}),
  explainOnCall: z.boolean().optional(),
});

export const discoveryEditInput = z.object({
  stepId: z.string().min(1),
  values: stepValues.default({}),
});

export const discoveryContactInput = z.object({
  name: z.string().default(""),
  email: z.string().optional(),
  phone: z.string().optional(),
});

export const discoveryRequestInput = z.object({
  preferred: z.string().optional(),
});

export const discoveryBookedInput = z.object({
  bookingUid: z.string().optional(),
  startTime: z.string().optional(),
});

export const callDoneInput = z.object({
  notes: z.string().min(1, "Add the call notes first."),
  decidedBy: z.string().min(1).default("Samuel"),
});

export const proposalDecisionInput = z.object({
  decidedBy: z.string().min(1).default("operator"),
  notes: z.string().optional(),
});

export const resultSchema = z.object({
  requestId: z.string(),
  client: z.string(),
  status: z.enum(["approved", "rejected"]),
  decidedBy: z.string(),
  factcheckPassed: z.boolean(),
  draftAttempts: z.number(),
  documents: z.array(z.object({ kind: z.string(), path: z.string() })),
});
