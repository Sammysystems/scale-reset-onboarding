import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Notification, Notifier } from "@studio/workflow";
import { createEngine } from "./engine.js";
import type { Engine } from "./engine.js";
import type { IntakeInput, ResumeData } from "./types.js";

interface RunOutcome {
  requestId?: string;
  client?: string;
  status?: string;
  decidedBy?: string;
  factcheckPassed?: boolean;
  draftAttempts?: number;
  documents?: Array<{ kind: string; path: string }>;
}

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const deliverablesRoot = process.env.DELIVERABLES_ROOT ?? path.join(root, "deliverables");

function capturingNotifier(): { notifier: Notifier; sent: Notification[] } {
  const sent: Notification[] = [];
  const notifier: Notifier = {
    channel: "email",
    async send(notification) {
      sent.push(notification);
    },
  };
  return { notifier, sent };
}

async function loadFixture(name: string): Promise<IntakeInput> {
  const file = path.join(root, "fixtures", name);
  return JSON.parse(await fs.readFile(file, "utf8")) as IntakeInput;
}

function clock(value: Date | string | undefined): string {
  if (!value) return "-";
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toISOString();
}

async function writeRunLog(
  engine: Engine,
  executionId: string,
  notifications: Notification[],
  client: string | undefined,
): Promise<string | null> {
  const detail = await engine.store.getRunDetail(executionId);
  if (!detail) return null;

  const lines = [
    `# Run Log — ${client ?? detail.run.id}`,
    "",
    `- Execution: ${detail.run.id}`,
    `- Workflow: ${detail.run.workflowId}`,
    `- Status: ${detail.run.status}`,
    `- Started: ${clock(detail.run.startedAt)}`,
    `- Ended: ${clock(detail.run.endedAt)}`,
    "",
    "## Steps",
    "",
    "| # | Step | Status | Started | Ended |",
    "| - | ---- | ------ | ------- | ----- |",
    ...detail.steps.map(
      (step) =>
        `| ${step.sequence} | ${step.stepId} | ${step.status} | ${clock(step.startedAt)} | ${clock(step.endedAt)} |`,
    ),
    "",
    "## Suspensions",
    "",
    detail.suspension
      ? [
          `- Step index: ${detail.suspension.stepIndex}`,
          `- Reason: ${detail.suspension.reason ?? "(none)"}`,
          `- At: ${clock(detail.suspension.suspendedAt)}`,
        ].join("\n")
      : "- none",
    "",
    "## Notifications",
    "",
    ...(notifications.length > 0
      ? notifications.map((note) => `- ${note.subject ?? "(no subject)"}: ${note.body}`)
      : ["- none"]),
    "",
    "## Logs",
    "",
    ...(detail.logs.length > 0
      ? detail.logs.map((log) => `- ${clock(log.timestamp)} [${log.level}] ${log.message}`)
      : ["- none"]),
    "",
  ];

  const documents = (detail.run.result as RunOutcome | undefined)?.documents;
  const targetDirectory = documents?.[0]?.path
    ? path.dirname(documents[0].path)
    : path.join(deliverablesRoot);

  await fs.mkdir(targetDirectory, { recursive: true });
  const file = path.join(targetDirectory, "RUN-LOG.md");
  await fs.writeFile(file, lines.join("\n"), "utf8");
  return file;
}

async function runScenario(
  label: string,
  engine: Engine,
  intake: IntakeInput,
  resumeSteps: ResumeData[],
  sent: Notification[],
): Promise<{ executionId: string; outcome: RunOutcome; notifications: Notification[] }> {
  const startIndex = sent.length;
  console.log(`\n== ${label} ==`);
  const first = await engine.run(intake);
  console.log(`  run started: ${first.executionId} (${first.status})`);

  let executionId = first.executionId;
  let last = first;

  for (const step of resumeSteps) {
    const resumed = await engine.resume(executionId, step);
    if (!resumed) {
      throw new Error(`resume returned no result for ${executionId}`);
    }
    last = resumed;
    executionId = resumed.executionId;
    console.log(
      `  resume ${step.action}: ${resumed.status}${
        resumed.suspension ? ` (waiting: ${resumed.suspension.reason ?? "no reason"})` : ""
      }`,
    );
  }

  return {
    executionId,
    outcome: (last.result ?? {}) as RunOutcome,
    notifications: sent.slice(startIndex),
  };
}

async function main(): Promise<void> {
  const { notifier, sent } = capturingNotifier();
  const engine = await createEngine({
    notifier,
    deliverablesRoot,
    dataRoot: path.join(root, ".data"),
    autoApprove: false,
  });

  console.log(`engine: mode=${engine.mode} model=${engine.modelName} project=${engine.project}`);

  const full = await loadFixture("sample-intake.full.json");
  const thin = await loadFixture("sample-intake.thin.json");

  const thinResult = await runScenario(
    "Scenario A — thin intake, supplemented, approved",
    engine,
    thin,
    [
      {
        action: "supplement",
        decidedBy: "demo-operator",
        supplements: {
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
        },
      },
      { action: "approve", decidedBy: "demo-operator", notes: "Approved after review." },
    ],
    sent,
  );

  const fullResult = await runScenario(
    "Scenario B — complete intake, approved",
    engine,
    full,
    [{ action: "approve", decidedBy: "demo-operator", notes: "Approved after review." }],
    sent,
  );

  const logs: string[] = [];
  for (const [label, result] of [
    ["A", thinResult],
    ["B", fullResult],
  ] as const) {
    const log = await writeRunLog(engine, result.executionId, result.notifications, result.outcome.client);
    logs.push(`${label}: ${log ?? "(no run detail)"}`);
  }

  console.log("\n== Result ==");
  for (const [label, result] of [
    ["A", thinResult],
    ["B", fullResult],
  ] as const) {
    console.log(
      `${label}: status=${result.outcome.status ?? "?"} factcheck=${
        result.outcome.factcheckPassed ? "passed" : "failed"
      } attempts=${result.outcome.draftAttempts ?? "?"}`,
    );
    for (const document of result.outcome.documents ?? []) {
      console.log(`   - ${document.kind}: ${document.path}`);
    }
  }
  console.log(`\nnotifications: ${sent.length}`);
  for (const log of logs) console.log(`run log: ${log}`);

  await engine.close();
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
