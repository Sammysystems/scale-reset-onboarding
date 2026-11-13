import type { DraftBundle, FactcheckIssue } from "./types.js";

export interface QcResult {
  errors: FactcheckIssue[];
  warnings: FactcheckIssue[];
}

const HARD_BANNED = [
  "in today's fast-paced world",
  "delve into",
  "game-changer",
  "revolutionize",
  "unleash",
  "cutting-edge",
];

const SOFT_BANNED = [
  "seamless",
  "leverage",
  "robust",
  "elevate",
  "unlock the power",
  "synergy",
];

const FIGURE = /(\d+(?:\.\d+)?\s?%|[$₦€£]\s?\d[\d,]*(?:\.\d+)?|\b\d{1,3}(?:,\d{3})+\b)/g;

function scanDoc(
  label: string,
  text: string,
  errors: FactcheckIssue[],
  warnings: FactcheckIssue[],
): void {
  const body = text.trim();

  if (body.length < 120) {
    errors.push({
      code: "too_thin",
      severity: "error",
      message: `${label}: document is ${body.length} chars, below the 120-char minimum`,
    });
  }

  const unverified = body.match(/\[\[UNVERIFIED:[^\]]*\]\]/g) ?? [];
  if (unverified.length > 0) {
    errors.push({
      code: "unverified_claim",
      severity: "error",
      message: `${label}: ${unverified.length} unverified claim marker(s), e.g. ${unverified[0]}`,
    });
  }

  if (/\[(?:x|X|\.\.\.|todo|tbd)\]|\bTODO\b|\bTBD\b/i.test(body)) {
    errors.push({
      code: "placeholder",
      severity: "error",
      message: `${label}: template placeholder left in the document`,
    });
  }

  if (/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(body)) {
    errors.push({
      code: "emoji",
      severity: "error",
      message: `${label}: emoji found in the document`,
    });
  }

  body.split(/\r?\n/).forEach((line, index) => {
    const figures = line.match(FIGURE);
    if (figures && !/\(source:|\(estimate\)|\bsource:|\bestimate\b/i.test(line)) {
      errors.push({
        code: "unsupported_figure",
        severity: "error",
        message: `${label} line ${index + 1}: figure "${figures[0]}" has no (source: ...) or (estimate) note`,
      });
    }
  });

  if (
    /\bguarantee[ds]?\b|\brisk-free\b|\b100%\s+(?:results?|success|returns?)\b/i.test(body)
  ) {
    errors.push({
      code: "guaranteed_outcome",
      severity: "error",
      message: `${label}: guarantees or risk-free outcome language is not allowed`,
    });
  }

  const lower = body.toLowerCase();
  for (const phrase of HARD_BANNED) {
    if (lower.includes(phrase)) {
      errors.push({
        code: "banned_phrase",
        severity: "error",
        message: `${label}: banned AI-slop phrase "${phrase}"`,
      });
    }
  }
  for (const phrase of SOFT_BANNED) {
    if (lower.includes(phrase)) {
      warnings.push({
        code: "soft_banned_phrase",
        severity: "warn",
        message: `${label}: consider replacing "${phrase}"`,
      });
    }
  }
}

/**
 * Deterministic quality gate. Runs on every draft before a human ever sees it.
 * Catches the failure the job description calls out: weak or unsupported claims.
 */
export function runQc(drafts: DraftBundle): QcResult {
  const errors: FactcheckIssue[] = [];
  const warnings: FactcheckIssue[] = [];

  scanDoc("client avatar", drafts.avatar, errors, warnings);
  scanDoc("tone of voice", drafts.tone, errors, warnings);
  scanDoc("onboarding report", drafts.report, errors, warnings);

  return { errors, warnings };
}
