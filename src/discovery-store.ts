import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { createAdminClient } from "@insforge/sdk";
import { STEP_IDS, STEPS, buildBrief } from "./discovery.js";
import type { DiscoveryBrief, DiscoveryContact } from "./discovery.js";
import type { PlayMatch } from "./plays.js";
import type { Proposal } from "./proposal.js";

export type DiscoveryStatus =
  | "in_progress"
  | "booking"
  | "call_booked"
  | "call_done"
  | "proposal_ready"
  | "approved"
  | "sent"
  | "paid"
  | "client"
  | "brief_ready"
  | "booked";

export const BOOKED_STATUSES: readonly DiscoveryStatus[] = [
  "call_booked",
  "call_done",
  "proposal_ready",
  "approved",
  "sent",
  "paid",
  "client",
  "booked",
];

export type CallStatus = "not_booked" | "requested" | "booked" | "cancelled" | "completed";

export interface DiscoveryCall {
  status: CallStatus;
  at?: string;
  bookingUid?: string;
  startTime?: string;
  notes?: string;
  source?: "cal" | "request" | "whatsapp";
}

export interface DiscoveryQuality {
  needsCall: boolean;
  thinSteps: string[];
}

export interface TranscriptEntry {
  role: "agent" | "client" | "system";
  text: string;
  at: string;
  stepId?: string;
}

export interface DiscoverySession {
  id: string;
  flowVersion: 2;
  createdAt: string;
  updatedAt: string;
  status: DiscoveryStatus;
  answers: Record<string, string>;
  asked: string[];
  pending: string[];
  transcript: TranscriptEntry[];
  contact?: DiscoveryContact;
  call?: DiscoveryCall;
  quality?: DiscoveryQuality;
  brief?: DiscoveryBrief;
  matches?: PlayMatch[];
  proposal?: Proposal;
  notes?: string;
  callNotes?: string;
  approvedBy?: string;
  approvedAt?: string;
  sentAt?: string;
  bookedAt?: string;
  callCompletedAt?: string;
  paidAt?: string;
  runId?: string;
}

export interface DiscoveryStore {
  create(): Promise<DiscoverySession>;
  get(id: string): Promise<DiscoverySession | null>;
  save(session: DiscoverySession): Promise<void>;
  list(): Promise<DiscoverySession[]>;
  clear(): Promise<void>;
}

function newId(): string {
  return `disc_${randomBytes(9).toString("hex")}`;
}

function safeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_");
}

export function createSession(): DiscoverySession {
  const now = new Date().toISOString();
  const first = STEPS[0];
  const transcript: TranscriptEntry[] = [
    {
      role: "agent",
      text:
        "Hi — this is the intake for The Scale Reset. Four quick questions, then you pick a time for a call.",
      at: now,
    },
  ];
  if (first) {
    transcript.push({
      role: "agent",
      text: first.title,
      at: now,
      stepId: first.id,
    });
  }

  return {
    id: newId(),
    flowVersion: 2,
    createdAt: now,
    updatedAt: now,
    status: "in_progress",
    answers: {},
    asked: [],
    pending: [...STEP_IDS],
    transcript,
    quality: { needsCall: false, thinSteps: [] },
  };
}

export class MemoryDiscoveryStore implements DiscoveryStore {
  private readonly sessions = new Map<string, DiscoverySession>();

  async create(): Promise<DiscoverySession> {
    const session = createSession();
    this.sessions.set(session.id, session);
    return session;
  }

  async get(id: string): Promise<DiscoverySession | null> {
    return this.sessions.get(id) ?? null;
  }

  async save(session: DiscoverySession): Promise<void> {
    this.sessions.set(session.id, session);
  }

  async list(): Promise<DiscoverySession[]> {
    return [...this.sessions.values()].sort(
      (left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt),
    );
  }

  async clear(): Promise<void> {
    this.sessions.clear();
  }
}

export class LocalDiscoveryStore implements DiscoveryStore {
  constructor(private readonly root: string) {}

  private sessionDir(): string {
    return path.join(this.root, "sessions");
  }

  private fileFor(id: string): string {
    return path.join(this.sessionDir(), `${safeId(id)}.json`);
  }

  async create(): Promise<DiscoverySession> {
    const session = createSession();
    await this.save(session);
    return session;
  }

  async get(id: string): Promise<DiscoverySession | null> {
    try {
      const raw = await fs.readFile(this.fileFor(id), "utf8");
      return JSON.parse(raw) as DiscoverySession;
    } catch {
      return null;
    }
  }

  async save(session: DiscoverySession): Promise<void> {
    await fs.mkdir(this.sessionDir(), { recursive: true });
    await fs.writeFile(this.fileFor(session.id), JSON.stringify(session, null, 2), "utf8");
  }

  async list(): Promise<DiscoverySession[]> {
    let files: string[] = [];
    try {
      files = await fs.readdir(this.sessionDir());
    } catch {
      return [];
    }

    const sessions: DiscoverySession[] = [];
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      try {
        const raw = await fs.readFile(path.join(this.sessionDir(), file), "utf8");
        sessions.push(JSON.parse(raw) as DiscoverySession);
      } catch {
        continue;
      }
    }

    return sessions.sort(
      (left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt),
    );
  }

  async clear(): Promise<void> {
    await fs.rm(this.sessionDir(), { recursive: true, force: true });
  }
}

interface InsForgeResult<T> {
  data: T;
  error: unknown;
}

interface InsForgeDatabase {
  from(table: string): {
    select(columns?: string): PromiseLike<InsForgeResult<unknown>>;
    upsert(values: Record<string, unknown>): PromiseLike<InsForgeResult<unknown>>;
    delete(): {
      neq(column: string, value: string): PromiseLike<InsForgeResult<unknown>>;
    };
  };
}

interface InsForgeClientLike {
  database: InsForgeDatabase;
}

function insForgeError(error: unknown): Error {
  if (error instanceof Error) return error;
  if (error && typeof error === "object" && "message" in error) {
    return new Error(String((error as { message: unknown }).message));
  }
  return new Error(String(error));
}

export class InsForgeDiscoveryStore implements DiscoveryStore {
  private readonly database: InsForgeDatabase;

  constructor(
    client: InsForgeClientLike,
    private readonly table = "scale_reset_discoveries",
  ) {
    this.database = client.database;
  }

  async create(): Promise<DiscoverySession> {
    const session = createSession();
    await this.save(session);
    return session;
  }

  async get(id: string): Promise<DiscoverySession | null> {
    const query = this.database.from(this.table) as unknown as {
      select(columns?: string): {
        eq(column: string, value: string): {
          maybeSingle(): PromiseLike<InsForgeResult<{ session?: DiscoverySession } | null>>;
        };
      };
    };
    const { data, error } = await query.select("session").eq("id", id).maybeSingle();
    if (error) throw insForgeError(error);
    return data?.session ?? null;
  }

  async save(session: DiscoverySession): Promise<void> {
    const { error } = await this.database.from(this.table).upsert({
      id: session.id,
      status: session.status,
      session,
      created_at: session.createdAt,
      updated_at: session.updatedAt,
    });
    if (error) throw insForgeError(error);
  }

  async list(): Promise<DiscoverySession[]> {
    const query = this.database.from(this.table) as unknown as {
      select(columns?: string): {
        order(column: string, options: { ascending: boolean }): PromiseLike<
          InsForgeResult<Array<{ session: DiscoverySession }>>
        >;
      };
    };
    const { data, error } = await query.select("session").order("updated_at", {
      ascending: false,
    });
    if (error) throw insForgeError(error);
    return (data ?? []).map((row) => row.session);
  }

  async clear(): Promise<void> {
    const { error } = await this.database.from(this.table).delete().neq("id", "");
    if (error) throw insForgeError(error);
  }
}

export function createDiscoveryStore(root?: string): DiscoveryStore {
  const insforgeUrl = process.env.INSFORGE_URL?.trim();
  const insforgeKey = process.env.INSFORGE_API_KEY?.trim();
  if (insforgeUrl && insforgeKey) {
    const client = createAdminClient({
      baseUrl: insforgeUrl,
      apiKey: insforgeKey,
    }) as unknown as InsForgeClientLike;
    return new InsForgeDiscoveryStore(
      client,
      process.env.INSFORGE_DISCOVERY_TABLE?.trim() || "scale_reset_discoveries",
    );
  }

  return root && root.trim().length > 0
    ? new LocalDiscoveryStore(root)
    : new MemoryDiscoveryStore();
}

export function refreshBrief(session: DiscoverySession): DiscoverySession {
  session.brief = buildBrief(session.answers, session.contact);
  return session;
}
