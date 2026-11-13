import type { IntakeForm } from "./types.js";

export const REQUIRED_FIELDS = [
  "businessDescription",
  "targetAudience",
  "brandPersonality",
  "competitors",
  "goals",
] as const;

export type RequiredField = (typeof REQUIRED_FIELDS)[number];

export const MIN_FIELD_LENGTH = 40;

export interface CompletenessReport {
  score: number;
  missing: string[];
  thin: string[];
  gaps: string[];
}

/**
 * Deterministic intake completeness. No model call.
 *
 * A field counts as present only when it clears MIN_FIELD_LENGTH; a short field is
 * recorded as thin and counts half. This is the gate that stops research running on a
 * form nobody filled in.
 */
export function assessCompleteness(form: IntakeForm | undefined): CompletenessReport {
  const fields: IntakeForm = form ?? {};
  const missing: string[] = [];
  const thin: string[] = [];
  let filled = 0;

  for (const field of REQUIRED_FIELDS) {
    const value = (fields[field] ?? "").trim();

    if (value.length === 0) {
      missing.push(field);
    } else if (value.length < MIN_FIELD_LENGTH) {
      thin.push(`${field} (too short)`);
      filled += 0.5;
    } else {
      filled += 1;
    }
  }

  const score = Math.round((filled / REQUIRED_FIELDS.length) * 100);

  return { score, missing, thin, gaps: [...missing, ...thin] };
}
