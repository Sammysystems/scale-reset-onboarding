import { describe, expect, it } from "vitest";
import {
  ALL_FIELDS,
  STEPS,
  buildBrief,
  composeBottleneckDetail,
  composeCurrentProcess,
  composeWhatTheyDo,
  isSpecific,
  listOf,
  progressOf,
  stepById,
  timeSinkPlay,
  validateContact,
  validateStep,
} from "../src/discovery.js";

describe("discovery step bank", () => {
  it("has four ordered steps", () => {
    expect(STEPS.map((step) => step.id)).toEqual(["business", "work", "week", "bottleneck"]);
    expect(ALL_FIELDS).toHaveLength(18);
  });

  it("adds an optional note to every step", () => {
    const optional = ALL_FIELDS.filter((field) => !field.required).map((field) => field.id);
    expect(optional).toEqual([
      "website",
      "businessDetail",
      "workDetail",
      "weekDetail",
      "costOfFailure",
      "bottleneckNote",
    ]);
  });

  it("exposes the time-sink to play map", () => {
    expect(timeSinkPlay("Replying to new enquiries")).toBe("lead-response");
    expect(timeSinkPlay("Weekly or monthly reports")).toBe("reporting-digest");
    expect(timeSinkPlay("Something else")).toBeUndefined();
  });
});

describe("step validation", () => {
  const business = {
    businessName: "Lagos Bloom Studio",
    industry: "Creative studio",
    location: "Lekki, Lagos",
    website: "",
  };

  it("accepts a complete step", () => {
    expect(validateStep("business", business).ok).toBe(true);
  });

  it("reports missing required fields", () => {
    const check = validateStep("business", { industry: "Creative studio" });
    expect(check.ok).toBe(false);
    expect(check.errors.businessName).toBeTruthy();
    expect(check.errors.location).toBeTruthy();
    expect(check.errors.website).toBeUndefined();
  });

  it("rejects a chip value that is not listed", () => {
    const check = validateStep("business", { ...business, industry: "Space mining" });
    expect(check.ok).toBe(false);
    expect(check.errors.industry).toBeTruthy();
  });

  it("requires at least one option on a multi field", () => {
    const check = validateStep("week", {
      timeSinks: [],
      tools: ["WhatsApp"],
      attempts: "Not yet",
    });
    expect(check.ok).toBe(false);
    expect(check.errors.timeSinks).toBeTruthy();
  });

  it("rejects thin text but lets the client explain on the call", () => {
    const thin = { ...business, businessName: "asdf", location: "test" };
    expect(validateStep("business", thin).ok).toBe(false);
    expect(validateStep("business", thin, { explainOnCall: true }).ok).toBe(true);
  });

  it("accepts any optional note without specificity checks", () => {
    const check = validateStep("business", {
      ...business,
      businessDetail: "asdf",
    });
    expect(check.ok).toBe(true);
  });

  it("knows which step owns a field", () => {
    expect(stepById("bottleneck")?.fields.map((field) => field.id)).toContain("costOfFailure");
    expect(stepById("nope")).toBeUndefined();
  });
});

describe("specificity checks", () => {
  it("rejects placeholders and gibberish", () => {
    for (const value of ["", "a", "asdf", "test", "asdfasdf", "aaaa", "12345"]) {
      expect(isSpecific(value), value).toBe(false);
    }
  });

  it("accepts real business answers", () => {
    for (const value of [
      "Lagos Bloom Studio",
      "Lekki, Lagos",
      "plan and style small weddings",
      "0803 555 0142",
      "ada@lagosbloom.com",
    ]) {
      expect(isSpecific(value), value).toBe(true);
    }
  });
});

describe("contact validation", () => {
  it("needs a name and at least one channel", () => {
    const missing = validateContact({ name: "" });
    expect(missing.ok).toBe(false);
    expect(missing.errors.name).toBeTruthy();
    expect(missing.errors.email).toBeTruthy();
  });

  it("accepts an email or a WhatsApp number", () => {
    expect(validateContact({ name: "Ada Okafor", email: "ada@lagosbloom.com" }).ok).toBe(true);
    expect(validateContact({ name: "Ada Okafor", phone: "0803 555 0142" }).ok).toBe(true);
  });

  it("rejects a malformed email and a short phone", () => {
    const badEmail = validateContact({ name: "Ada Okafor", email: "ada@" });
    expect(badEmail.ok).toBe(false);
    const badPhone = validateContact({ name: "Ada Okafor", phone: "123" });
    expect(badPhone.ok).toBe(false);
  });
});

describe("composed copy", () => {
  it("builds a what-they-do sentence from three guided parts", () => {
    const sentence = composeWhatTheyDo({
      offer: "We plan and style small weddings",
      customer: "busy professionals in Lagos",
      outcome: "one team to handle every detail",
    });
    expect(sentence).toBe(
      "We plan and style small weddings for busy professionals in Lagos who want one team to handle every detail.",
    );
  });

  it("builds a current-process line from taps", () => {
    const process = composeCurrentProcess({
      timeSinks: "Replying to new enquiries, Booking appointments and reminders",
      tools: "WhatsApp, Instagram DMs",
      attempts: "Tried a tool",
    });
    expect(process).toContain("Most of the week goes to");
    expect(process).toContain("WhatsApp and Instagram DMs");
    expect(process).toContain("Fix attempts so far: tried a tool.");
  });

  it("builds a bottleneck detail line from frequency and time cost", () => {
    const detail = composeBottleneckDetail({
      frequency: "Daily",
      timeCost: "15–60 minutes",
      costOfFailure: "Lost bookings",
    });
    expect(detail).toContain("daily");
    expect(detail).toContain("15–60 minutes each time");
    expect(detail).toContain("Cost when it slips: Lost bookings.");
  });

  it("splits comma lists and drops blanks", () => {
    expect(listOf(" WhatsApp , , Email ")).toEqual(["WhatsApp", "Email"]);
    expect(listOf(undefined)).toEqual([]);
  });
});

describe("brief and progress", () => {
  const answers = {
    businessName: "Lagos Bloom Studio",
    industry: "Creative studio",
    location: "Lekki, Lagos",
    website: "@lagosbloom",
    offer: "plan and style small weddings",
    customer: "busy professionals in Lagos",
    outcome: "one team to handle every detail",
    timeSinks: "Replying to new enquiries",
    tools: "WhatsApp",
    attempts: "Not yet",
    bottleneck: "Replying to new enquiries",
    frequency: "Several times a day",
    timeCost: "15–60 minutes",
    costOfFailure: "We lose bookings",
  };

  it("summarises the business into a readable brief", () => {
    const brief = buildBrief(answers, { name: "Ada Okafor", phone: "0803 555 0142" });
    expect(brief.clientName).toBe("Lagos Bloom Studio");
    expect(brief.summary).toContain("Lagos Bloom Studio");
    expect(brief.summary).toContain("Lekki, Lagos");
    expect(brief.summary.toLowerCase()).toContain("creative studio");
    expect(brief.summary.toLowerCase()).toContain("replying to new enquiries");
    expect(brief.contact).toBe("Ada Okafor · 0803 555 0142");
  });

  it("fills in composed fields when answers are missing", () => {
    const brief = buildBrief(answers);
    expect(brief.whatTheyDo).toContain("We plan and style small weddings");
    expect(brief.currentProcess).toContain("Most of the week goes to");
    expect(brief.bottleneckDetail).toContain("each time");
  });

  it("computes progress as answered over total", () => {
    expect(progressOf(0, 0)).toBe(100);
    expect(progressOf(1, 3)).toBe(25);
    expect(progressOf(4, 0)).toBe(100);
  });
});
