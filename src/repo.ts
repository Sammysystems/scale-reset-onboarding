import { promises as fs } from "node:fs";
import path from "node:path";
import type { RunRecordData } from "./types.js";

export interface Repository {
  save(record: RunRecordData): Promise<void>;
  get(requestId: string): Promise<RunRecordData | null>;
}

function safeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_");
}

export class MemoryRepository implements Repository {
  private readonly records = new Map<string, RunRecordData>();

  async save(record: RunRecordData): Promise<void> {
    this.records.set(record.requestId, record);
  }

  async get(requestId: string): Promise<RunRecordData | null> {
    return this.records.get(requestId) ?? null;
  }
}

export class LocalJsonRepository implements Repository {
  constructor(private readonly root: string) {}

  private fileFor(requestId: string): string {
    return path.join(this.root, "requests", `${safeId(requestId)}.json`);
  }

  async save(record: RunRecordData): Promise<void> {
    const file = this.fileFor(record.requestId);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(record, null, 2), "utf8");
  }

  async get(requestId: string): Promise<RunRecordData | null> {
    try {
      const raw = await fs.readFile(this.fileFor(requestId), "utf8");
      return JSON.parse(raw) as RunRecordData;
    } catch {
      return null;
    }
  }
}
