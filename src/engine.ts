import { WorkflowRegistry } from "@voltagent/core";
import {
  closeMemory,
  createTableEventSink,
  PostgresTableWriter,
  registerWorkflow,
  resetWorkflowRegistry,
  resolveMemory,
  resolveProfile,
  resumeRun,
  suspensionReason,
} from "@studio/workflow";
import type { Notifier } from "@studio/workflow";
import { createModelClientFromEnv } from "./agents/model.js";
import type { ModelClient } from "./agents/model.js";
import { LocalArtifactStore } from "./artifacts.js";
import type { ArtifactStore } from "./artifacts.js";
import { createMemorySink } from "./observe/memory-sink.js";
import type { MemorySink } from "./observe/memory-sink.js";
import { createNotifierFromEnv } from "./notifiers/index.js";
import { LocalJsonRepository, MemoryRepository } from "./repo.js";
import type { Repository } from "./repo.js";
import { MemoryRunStore, PgRunStore } from "./store.js";
import type { RunStore } from "./store.js";
import type { IntakeInput, ResumeData } from "./types.js";
import { buildWorkflow, WORKFLOW_ID } from "./workflow.js";

export interface EngineRunResult {
  executionId: string;
  workflowId: string;
  status: string;
  result?: unknown;
  suspension?: {
    reason?: string;
    suspendedStepIndex: number;
    suspendData?: unknown;
  } | null;
}

function decorate(raw: unknown): EngineRunResult {
  const result = raw as EngineRunResult;
  return {
    executionId: result.executionId,
    workflowId: result.workflowId,
    status: result.status,
    result: result.result,
    suspension: result.suspension
      ? {
          reason: suspensionReason(result.suspension),
          suspendedStepIndex: result.suspension.suspendedStepIndex,
          suspendData: result.suspension.suspendData,
        }
      : null,
  };
}

export interface EngineOptions {
  model?: ModelClient;
  notifier?: Notifier;
  repository?: Repository;
  artifacts?: ArtifactStore;
  project?: string;
  completenessThreshold?: number;
  maxDraftAttempts?: number;
  autoApprove?: boolean;
  deliverablesRoot?: string;
  dataRoot?: string;
  databaseUrl?: string;
  dbSchema?: string;
  tablePrefix?: string;
}

export interface Engine {
  readonly mode: "demo" | "client";
  readonly modelName: string;
  readonly project: string;
  readonly store: RunStore;
  readonly memorySink?: MemorySink;
  run(input: IntakeInput): Promise<EngineRunResult>;
  resume(executionId: string, data: ResumeData): Promise<EngineRunResult | null>;
  close(): Promise<void>;
}

export async function createEngine(options: EngineOptions = {}): Promise<Engine> {
  const env = process.env;
  const project = options.project ?? env.STUDIO_PROJECT ?? "client-onboarding";
  const completenessThreshold =
    options.completenessThreshold ?? Number(env.COMPLETENESS_THRESHOLD ?? 70);
  const maxDraftAttempts = options.maxDraftAttempts ?? Number(env.MAX_DRAFT_ATTEMPTS ?? 2);
  const autoApprove = options.autoApprove ?? env.AUTO_APPROVE === "true";
  const deliverablesRoot = options.deliverablesRoot ?? env.DELIVERABLES_ROOT ?? "deliverables";
  const dataRoot = options.dataRoot ?? env.DATA_ROOT ?? ".data";
  const databaseUrl = options.databaseUrl ?? env.DATABASE_URL;
  const schema = options.dbSchema ?? env.DB_SCHEMA ?? "public";
  const tablePrefix = options.tablePrefix ?? env.TABLE_PREFIX ?? "onboarding_";

  const model = options.model ?? createModelClientFromEnv(env);
  const notifier = options.notifier ?? createNotifierFromEnv(env);
  const artifacts = options.artifacts ?? new LocalArtifactStore(deliverablesRoot);

  const persistent = Boolean(databaseUrl);

  const memorySink = persistent ? undefined : createMemorySink();
  const writer = persistent && databaseUrl
    ? new PostgresTableWriter({ connection: databaseUrl, schema, tablePrefix })
    : undefined;

  const sink = writer ? createTableEventSink(writer) : memorySink;
  if (!sink) throw new Error("Failed to resolve an event sink");

  const store: RunStore = writer && memorySink === undefined ? new PgRunStore(writer) : new MemoryRunStore(memorySink!);

  const memory = persistent && databaseUrl
    ? resolveMemory(resolveProfile("client"), {
        connection: databaseUrl,
        schema,
        tablePrefix: `${tablePrefix}memory`,
      })
    : resolveMemory(resolveProfile("demo"));

  const repository: Repository =
    options.repository ?? (persistent ? new LocalJsonRepository(dataRoot) : new MemoryRepository());

  resetWorkflowRegistry();
  const chain = buildWorkflow({
    model,
    memory,
    sink,
    notifier,
    repository,
    artifacts,
    project,
    completenessThreshold,
    maxDraftAttempts,
    autoApprove,
  });

  const workflow = chain.toWorkflow();
  const registry = WorkflowRegistry.getInstance();
  registry.unregisterWorkflow(WORKFLOW_ID);
  registerWorkflow(registry, workflow);

  return {
    mode: persistent ? "client" : "demo",
    modelName: model.name,
    project,
    store,
    ...(memorySink ? { memorySink } : {}),

    async run(input) {
      return decorate(await workflow.run(input));
    },

    async resume(executionId, data) {
      const result = await resumeRun(registry, WORKFLOW_ID, executionId, data);
      return result ? decorate(result) : null;
    },

    async close() {
      await closeMemory(memory);
      if (writer) await writer.close();
    },
  };
}
