import { describe, expect, it } from "vitest";
import { combinedTimeline, formatNaira, formatRange, matchPlays, PLAYS } from "../src/plays.js";

describe("automation play matcher", () => {
  it("ships five unique plays", () => {
    const ids = PLAYS.map((play) => play.id);
    expect(ids).toHaveLength(5);
    expect(new Set(ids).size).toBe(5);
  });

  it("routes an explicit bottleneck tap straight to its play", () => {
    expect(matchPlays({ bottleneck: "Invoices and payment chasing" })[0]?.play.id).toBe(
      "invoice-chase",
    );
    expect(matchPlays({ timeSink: "Booking appointments and reminders" })[0]?.play.id).toBe(
      "booking-reminders",
    );
    expect(matchPlays({ bottleneck: "Weekly or monthly reports" })[0]?.confidence).toBe("high");
  });

  it("routes a slow-reply bottleneck to lead response", () => {
    const matches = matchPlays({
      bottleneck:
        "Replies to enquiries take hours because the phone sits on the owner's desk and nobody follows up on WhatsApp.",
    });
    expect(matches[0]?.play.id).toBe("lead-response");
    expect(matches[0]?.confidence).not.toBe("low");
  });

  it("routes unpaid invoices to the payment chase", () => {
    const matches = matchPlays({
      bottleneck:
        "Invoices sit unpaid for weeks and nobody chases the overdue reminder on bank transfers.",
    });
    expect(matches[0]?.play.id).toBe("invoice-chase");
  });

  it("routes a rebuilt monthly report to reporting", () => {
    const matches = matchPlays({
      bottleneck:
        "We rebuild the monthly report by hand and copy-paste numbers from three spreadsheets; the weekly numbers disagree.",
    });
    expect(matches[0]?.play.id).toBe("reporting-digest");
  });

  it("respects the match limit", () => {
    const matches = matchPlays(
      {
        bottleneck: "We lose enquiries on WhatsApp and the invoice reminders are manual.",
        currentProcess: "Enquiries arrive, we send a quote, then chase a payment.",
      },
      1,
    );
    expect(matches).toHaveLength(1);
  });

  it("falls back to a low-confidence lead response with no signal", () => {
    const matches = matchPlays({});
    expect(matches).toHaveLength(1);
    expect(matches[0]?.play.id).toBe("lead-response");
    expect(matches[0]?.confidence).toBe("low");
  });

  it("formats Naira ranges", () => {
    expect(formatNaira(350000)).toBe("₦350,000");
    expect(formatRange(350000, 600000)).toBe("₦350,000 – ₦600,000");
  });

  it("summarises timelines by play count", () => {
    const [first, second] = PLAYS;
    expect(combinedTimeline([first!])).toBe(first!.timeline);
    expect(combinedTimeline([first!, second!])).toBe("4–6 weeks");
    expect(combinedTimeline([])).toBe("2–3 weeks");
  });
});
