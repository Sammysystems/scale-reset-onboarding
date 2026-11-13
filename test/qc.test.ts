import { describe, expect, it } from "vitest";
import { runQc } from "../src/qc.js";
import type { DraftBundle } from "../src/types.js";

const body =
  "The client serves small business owners who need a dependable stream of qualified enquiries without hiring a full sales team.";

function drafts(overrides: Partial<DraftBundle> = {}): DraftBundle {
  return {
    avatar: `## Who they serve\n\n${body}\n\n## Pain points\n\n- Enquiries arrive late.`,
    tone: `## Voice\n\n${body}\n\n- Clear about the next step.`,
    report: `## Snapshot\n\n${body}\n\n- Fix the slowest handoff first.`,
    ...overrides,
  };
}

function codes(result: ReturnType<typeof runQc>): string[] {
  return [...result.errors, ...result.warnings].map((issue) => issue.code);
}

describe("runQc", () => {
  it("passes clean drafts with no errors", () => {
    const result = runQc(drafts());
    expect(result.errors).toEqual([]);
  });

  it("rejects an unverified claim marker", () => {
    const result = runQc(
      drafts({ avatar: `## Claims\n\n${body} [[UNVERIFIED: no source]]` }),
    );
    expect(result.errors.map((issue) => issue.code)).toContain("unverified_claim");
  });

  it("rejects a figure without a source on the same line", () => {
    const result = runQc(
      drafts({ avatar: `## Claims\n\n${body}\n\nThey lose 37% of inbound leads.` }),
    );
    expect(result.errors.map((issue) => issue.code)).toContain("unsupported_figure");
  });

  it("accepts a figure when its source is on the same line", () => {
    const result = runQc(
      drafts({
        avatar: `## Claims\n\n${body}\n\nThey lose 37% of inbound leads (source: client dashboard).`,
      }),
    );
    expect(result.errors.map((issue) => issue.code)).not.toContain("unsupported_figure");
  });

  it("rejects placeholders and emojis", () => {
    const result = runQc(
      drafts({
        tone: `## Voice\n\n${body}\n\nTODO add tone line.`,
        report: `## Report\n\n${body}\n\nReady 🚀`,
      }),
    );
    expect(codes(result)).toContain("placeholder");
    expect(codes(result)).toContain("emoji");
  });

  it("rejects banned AI-slop phrases", () => {
    const result = runQc(
      drafts({ report: `## Report\n\n${body}\n\nThis is a game-changer.` }),
    );
    expect(result.errors.map((issue) => issue.code)).toContain("banned_phrase");
  });
});
