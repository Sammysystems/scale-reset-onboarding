import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Notification, Notifier } from "@studio/workflow";
import { createEngine } from "../src/engine.js";
import type { Engine } from "../src/engine.js";
import type { IntakeInput } from "../src/types.js";

interface RunOutcome {
  requestId?: string;
  client?: string;
  status?: string;
  decidedBy?: string;
  factcheckPassed?: boolean;
  draftAttempts?: number;
  documents?: Array<{ kind: string; path: string }>;
}

const fullIntake: IntakeInput = {
  clientName: "Halden & Co",
  industry: "B2B bookkeeping",
  website: "https://halden.example",
  context: "Two-partner firm. Enquiries come from a contact form, a shared inbox, and referrals.",
  docs: ["Owner wrote: we lose track of quotes when the inbox gets busy."],
  form: {
    businessDescription:
      "A two-partner bookkeeping firm serving small agencies and consultancies that have outgrown a spreadsheet.",
    targetAudience:
      "Owners of 5-20 person agencies who need monthly books, payroll support, and someone to answer tax questions.",
    brandPersonality:
      "Calm, precise, plain-spoken. We explain the number before we recommend the fix.",
    competitors:
      "Local accounting practices that bundle bookkeeping into annual accounts, and a few online bookkeeping services.",
    goals:
      "Respond to every new enquiry within one working day and stop losing quote requests in the shared inbox.",
    toneExamples: "Here is what happens next, and who does it.",
    offLimits: "No jargon, no guarantees about tax outcomes, never mention competitor pricing.",
  },
  source: "test",
};

const thinIntake: IntakeInput = {
  clientName: "Mira Studio",
  industry: "interior design",
  context: "Referral from a current client. The owner filled the form on her phone.",
  form: {
    businessDescription: "Interior design studio.",
    targetAudience: "",
    brandPersonality: "Warm.",
    goals: "Get more enquiries.",
  },
  source: "test",
};

const supplements = {
  businessDescription:
    "A three-person interior design studio working on residential renovations and small hospitality fit-outs.",
  targetAudience:
    "Homeowners and cafe owners in Lagos planning a full renovation who want one team to handle design and build.",
  brandPersonality:
    "Warm but decisive. We show the plan, name the trade-offs, and keep the site tidy.",
  competitors:
    "Freelance designers who hand off to contractors, and larger firms that only take premium projects.",
  goals:
    "Qualify enquiries faster and stop spending first calls on projects outside our budget range.",
};

let engine: Engine;
let sent: Notification[];
let workdir: string;

beforeEach(async () => {
  workdir = await fs.mkdtemp(path.join(os.tmpdir(), "onboarding-"));
  sent = [];
  const notifier: Notifier = {
    channel: "email",
    async send(notification) {
      sent.push(notification);
    },
  };
  engine = await createEngine({
    notifier,
    deliverablesRoot: path.join(workdir, "deliverables"),
    dataRoot: path.join(workdir, "data"),
    completenessThreshold: 70,
    maxDraftAttempts: 2,
    autoApprove: false,
  });
});

afterEach(async () => {
  await engine.close();
  await fs.rm(workdir, { recursive: true, force: true });
});

describe("client onboarding workflow", () => {
  it("suspends for approval, then finalizes source-checked documents on approve", async () => {
    const run = await engine.run(fullIntake);
    expect(run.status).toBe("suspended");
    expect(run.suspension?.reason).toContain("approval");

    const resumed = await engine.resume(run.executionId, {
      action: "approve",
      decidedBy: "tester",
      notes: "Looks good.",
    });

    expect(resumed?.status).toBe("completed");
    const outcome = resumed?.result as RunOutcome;
    expect(outcome.status).toBe("approved");
    expect(outcome.decidedBy).toBe("tester");
    expect(outcome.factcheckPassed).toBe(true);
    expect(outcome.draftAttempts).toBe(2);
    expect(outcome.documents).toHaveLength(3);

    for (const document of outcome.documents ?? []) {
      await expect(fs.access(document.path)).resolves.toBeUndefined();
    }

    expect(sent.some((note) => note.subject?.includes("Approve onboarding"))).toBe(true);
    expect(sent.some((note) => note.subject?.includes("Onboarding approved"))).toBe(true);
  });

  it("stops thin intake at the screen gate and continues after supplements", async () => {
    const run = await engine.run(thinIntake);
    expect(run.status).toBe("suspended");
    expect(run.suspension?.reason).toContain("thin");

    const afterSupplement = await engine.resume(run.executionId, {
      action: "supplement",
      decidedBy: "tester",
      supplements,
    });

    expect(afterSupplement?.status).toBe("suspended");
    expect(afterSupplement?.suspension?.reason).toContain("approval");

    const done = await engine.resume(afterSupplement!.executionId, {
      action: "approve",
      decidedBy: "tester",
    });

    expect(done?.status).toBe("completed");
    expect((done?.result as RunOutcome).status).toBe("approved");
    expect((done?.result as RunOutcome).documents).toHaveLength(3);
  });

  it("proceeds past a thin intake when the operator chooses to continue", async () => {
    const run = await engine.run(thinIntake);
    expect(run.suspension?.reason).toContain("thin");

    const afterProceed = await engine.resume(run.executionId, {
      action: "proceed",
      decidedBy: "tester",
    });

    expect(afterProceed?.status).toBe("suspended");
    expect(afterProceed?.suspension?.reason).toContain("approval");
  });

  it("records a rejection without claiming delivery", async () => {
    const run = await engine.run(fullIntake);
    const done = await engine.resume(run.executionId, {
      action: "reject",
      decidedBy: "tester",
      notes: "Not a fit for this quarter.",
    });

    expect(done?.status).toBe("completed");
    expect((done?.result as RunOutcome).status).toBe("rejected");
    expect((done?.result as RunOutcome).decidedBy).toBe("tester");
  });

  it("runs every step for a complete intake and exposes a run timeline", async () => {
    const run = await engine.run(fullIntake);
    const done = await engine.resume(run.executionId, {
      action: "approve",
      decidedBy: "tester",
    });

    const detail = await engine.store.getRunDetail(done!.executionId);
    expect(detail).not.toBeNull();
    const stepIds = detail!.steps.map((step) => step.stepId);
    expect(stepIds).toEqual(["intake", "screen", "research", "draft", "approval", "finalize"]);
    expect(detail!.run.status).toBe("completed");

    const suspensions = await engine.store.listSuspensions();
    expect(suspensions.length).toBeGreaterThanOrEqual(1);
  });
});
