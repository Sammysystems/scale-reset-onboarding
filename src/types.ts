import type { z } from "zod";
import type { intakeInput, resumeSchema, resultSchema } from "./schemas.js";

export type IntakeInput = z.infer<typeof intakeInput>;
export type ResumeData = z.infer<typeof resumeSchema>;
export type WorkflowResult = z.infer<typeof resultSchema>;

export interface IntakeForm {
  businessDescription?: string;
  targetAudience?: string;
  brandPersonality?: string;
  competitors?: string;
  goals?: string;
  toneExamples?: string;
  offLimits?: string;
}

export interface NormalizedIntake {
  requestId: string;
  clientName: string;
  industry: string;
  website?: string;
  context: string;
  docs: string[];
  form: IntakeForm;
  source: string;
}

export interface SourceRef {
  label: string;
  detail: string;
}

export interface ResearchFindings {
  workflowAudit: string;
  techStack: string;
  strategy: string;
}

export interface ResearchResult {
  contextBrief: string;
  findings: ResearchFindings;
  sources: SourceRef[];
}

export interface DraftBundle {
  avatar: string;
  tone: string;
  report: string;
}

export interface FactcheckIssue {
  code: string;
  message: string;
  severity: "error" | "warn";
}

export interface FactcheckResult {
  passed: boolean;
  issues: FactcheckIssue[];
  attempts: number;
}

export interface ScreenResult {
  action: "auto" | "supplement" | "proceed";
  decidedBy: string;
  completeness: number;
  missing: string[];
  supplements?: Record<string, string>;
}

export interface Decision {
  status: "approved" | "rejected";
  decidedBy: string;
  notes?: string;
}

export interface StoredDocument {
  kind: string;
  path: string;
  url?: string;
  key?: string;
}

export interface RenderableDocument {
  kind: string;
  filename: string;
  content: string;
}

export interface RunRecordData {
  requestId: string;
  intake: NormalizedIntake;
  research?: ResearchResult;
  drafts?: DraftBundle;
  factcheck?: FactcheckResult;
  decision?: Decision;
  documents?: StoredDocument[];
}
