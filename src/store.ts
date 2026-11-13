import type {
  LogRecord,
  PostgresTableWriter,
  RunRecord,
  StepRecord,
  SuspensionRecord,
} from "@studio/workflow";
import type { MemorySink } from "./observe/memory-sink.js";

export interface RunDetail {
  run: RunRecord;
  steps: StepRecord[];
  suspension: SuspensionRecord | null;
  logs: LogRecord[];
}

export interface RunStore {
  listRuns(status?: string, limit?: number): Promise<RunRecord[]>;
  getRunDetail(id: string): Promise<RunDetail | null>;
  listSuspensions(): Promise<SuspensionRecord[]>;
}

export class MemoryRunStore implements RunStore {
  constructor(private readonly sink: MemorySink) {}

  async listRuns(status?: string, limit = 50): Promise<RunRecord[]> {
    const { runs } = this.sink.snapshot();
    return runs
      .filter((run) => (status ? run.status === status : true))
      .sort((left, right) => right.startedAt.getTime() - left.startedAt.getTime())
      .slice(0, limit);
  }

  async getRunDetail(id: string): Promise<RunDetail | null> {
    const { runs, steps, suspensions, logs } = this.sink.snapshot();
    const run = runs.find((candidate) => candidate.id === id);
    if (!run) return null;

    return {
      run,
      steps: steps
        .filter((step) => step.runId === id)
        .sort((left, right) => left.sequence - right.sequence),
      suspension: suspensions.find((record) => record.runId === id) ?? null,
      logs: logs.filter((log) => log.runId === id),
    };
  }

  async listSuspensions(): Promise<SuspensionRecord[]> {
    return this.sink.snapshot().suspensions;
  }
}

function rowToRun(row: Record<string, unknown>): RunRecord {
  return {
    id: String(row.id),
    project: String(row.project),
    workflowId: String(row.workflow_id),
    status: row.status as RunRecord["status"],
    startedAt: new Date(String(row.started_at)),
    endedAt: row.ended_at ? new Date(String(row.ended_at)) : undefined,
    input: row.input ?? undefined,
    result: row.result ?? undefined,
    error: row.error ? String(row.error) : undefined,
  };
}

function rowToStep(row: Record<string, unknown>): StepRecord {
  return {
    runId: String(row.run_id),
    stepId: String(row.step_id),
    name: String(row.name),
    sequence: Number(row.sequence),
    status: row.status as StepRecord["status"],
    startedAt: new Date(String(row.started_at)),
    endedAt: row.ended_at ? new Date(String(row.ended_at)) : undefined,
    input: row.input ?? undefined,
    output: row.output ?? undefined,
    error: row.error ? String(row.error) : undefined,
  };
}

function rowToSuspension(row: Record<string, unknown>): SuspensionRecord {
  return {
    runId: String(row.run_id),
    workflowId: String(row.workflow_id),
    stepIndex: Number(row.step_index),
    suspendedAt: new Date(String(row.suspended_at)),
    reason: row.reason ? String(row.reason) : undefined,
    resumeData: row.resume_data ?? undefined,
  };
}

export class PgRunStore implements RunStore {
  constructor(private readonly writer: PostgresTableWriter) {}

  async listRuns(status?: string, limit = 50): Promise<RunRecord[]> {
    const values: unknown[] = [];
    const conditions: string[] = [];

    if (status) {
      values.push(status);
      conditions.push(`status = $${values.length}`);
    }

    values.push(limit);
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const { rows } = await this.writer.query<Record<string, unknown>>(
      `SELECT * FROM ${this.writer.table("workflow_runs")} ${where} ORDER BY started_at DESC LIMIT $${values.length}`,
      values,
    );

    return rows.map(rowToRun);
  }

  async getRunDetail(id: string): Promise<RunDetail | null> {
    const runResult = await this.writer.query<Record<string, unknown>>(
      `SELECT * FROM ${this.writer.table("workflow_runs")} WHERE id = $1`,
      [id],
    );
    const runRow = runResult.rows[0];
    if (!runRow) return null;

    const [stepsResult, suspensionResult, logsResult] = await Promise.all([
      this.writer.query<Record<string, unknown>>(
        `SELECT * FROM ${this.writer.table("workflow_steps")} WHERE run_id = $1 ORDER BY sequence ASC`,
        [id],
      ),
      this.writer.query<Record<string, unknown>>(
        `SELECT * FROM ${this.writer.table("workflow_suspensions")} WHERE run_id = $1`,
        [id],
      ),
      this.writer.query<Record<string, unknown>>(
        `SELECT * FROM ${this.writer.table("workflow_logs")} WHERE run_id = $1 ORDER BY timestamp ASC LIMIT 200`,
        [id],
      ),
    ]);

    const suspensionRow = suspensionResult.rows[0];

    return {
      run: rowToRun(runRow),
      steps: stepsResult.rows.map(rowToStep),
      suspension: suspensionRow ? rowToSuspension(suspensionRow) : null,
      logs: logsResult.rows.map((row) => ({
        runId: String(row.run_id),
        level: row.level as LogRecord["level"],
        message: String(row.message),
        timestamp: new Date(String(row.timestamp)),
      })),
    };
  }

  async listSuspensions(): Promise<SuspensionRecord[]> {
    const { rows } = await this.writer.query<Record<string, unknown>>(
      `SELECT * FROM ${this.writer.table("workflow_suspensions")} ORDER BY suspended_at DESC LIMIT 200`,
    );
    return rows.map(rowToSuspension);
  }
}
