import type {
  LogRecord,
  RunRecord,
  StepRecord,
  StudioEventSink,
  SuspensionRecord,
} from "@studio/workflow";

export interface SinkSnapshot {
  runs: RunRecord[];
  steps: StepRecord[];
  logs: LogRecord[];
  suspensions: SuspensionRecord[];
}

export interface MemorySink extends StudioEventSink {
  snapshot(): SinkSnapshot;
}

/**
 * In-memory event sink with upsert semantics, mirroring the Postgres tables the kit
 * writes to. Lets the demo and tests show a real run timeline without a database.
 */
export function createMemorySink(): MemorySink {
  const runs = new Map<string, RunRecord>();
  const steps = new Map<string, StepRecord>();
  const logs: LogRecord[] = [];
  const suspensions = new Map<string, SuspensionRecord>();

  return {
    async run(record: RunRecord): Promise<void> {
      runs.set(record.id, record);
    },
    async step(record: StepRecord): Promise<void> {
      steps.set(`${record.runId}:${record.stepId}`, record);
    },
    async log(record: LogRecord): Promise<void> {
      logs.push(record);
    },
    async suspension(record: SuspensionRecord): Promise<void> {
      suspensions.set(record.runId, record);
    },
    snapshot(): SinkSnapshot {
      return {
        runs: [...runs.values()],
        steps: [...steps.values()],
        logs: [...logs],
        suspensions: [...suspensions.values()],
      };
    },
  };
}
