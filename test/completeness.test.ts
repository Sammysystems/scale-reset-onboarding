import { describe, expect, it } from "vitest";
import { assessCompleteness, MIN_FIELD_LENGTH, REQUIRED_FIELDS } from "../src/completeness.js";
import type { IntakeForm } from "../src/types.js";

const long = (label: string) => `${label} ${"x".repeat(MIN_FIELD_LENGTH)}`;

const fullForm: IntakeForm = {
  businessDescription: long("business"),
  targetAudience: long("audience"),
  brandPersonality: long("personality"),
  competitors: long("competitors"),
  goals: long("goals"),
};

describe("assessCompleteness", () => {
  it("scores a fully filled form at 100", () => {
    const report = assessCompleteness(fullForm);
    expect(report.score).toBe(100);
    expect(report.gaps).toEqual([]);
    expect(report.missing).toEqual([]);
  });

  it("counts missing fields and flags short ones", () => {
    const report = assessCompleteness({
      businessDescription: "Short.",
      targetAudience: "",
      brandPersonality: long("personality"),
      competitors: "",
      goals: long("goals"),
    });

    expect(report.missing).toContain("targetAudience");
    expect(report.missing).toContain("competitors");
    expect(report.thin).toContain("businessDescription (too short)");
    expect(report.score).toBe(50);
  });

  it("scores an absent form at 0 and lists every required field", () => {
    const report = assessCompleteness(undefined);
    expect(report.score).toBe(0);
    expect(report.gaps).toEqual([...REQUIRED_FIELDS]);
  });
});
